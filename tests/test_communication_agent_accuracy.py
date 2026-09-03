"""
PATIENT-ADMIN COMMUNICATION AGENT ACCURACY
-------------------------------------------
Agent 2 ("Intelligent Patient-Admin Communication Agent") has two halves:

  1. The hand-off DECISION - which message categories from
     classify_general_message() should trigger a hand-off vs. stay in the
     booking flow. That classifier belongs to Agent 1 and is already
     evaluated end-to-end (CLASSIFY_DATASET) in
     test_ai_extraction_accuracy.py, so it is not duplicated here.

  2. The bi-directional message RELAY once a hand-off is live: saving admin
     replies/edits/deletes to chat_messages and pushing them to the patient
     via Telegram, and skipping that push for SMS-only patients
     (main.py's /ask-admin, /admin/chat-reply, /admin/chat-reply/{id},
     /admin/chat-pending-count/{clinic_id}). That's what this file evaluates.

NOTE: the Telegram-specific state machine that flips `is_live_chat` and asks
the patient to confirm a hand-off (bot.py's handle_general_text) is driven by
python-telegram-bot Update/Context objects and pulls in easyocr + a live
Telegram client at import time. No test file in this suite imports bot.py,
so that piece isn't unit-tested here either - only the main.py endpoints it
calls (/classify-message, /ask-admin) are, which this file and
test_ai_extraction_accuracy.py already cover.

Uses MagicMock for the db Session (same pattern as test_agent.py's Agent 3
tests) plus a small fake httpx.AsyncClient, so no real Telegram API calls
are ever made.

Run just these with:
    pytest -m accuracy test_communication_agent_accuracy.py
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from main import (
    ask_admin,
    reply_chat,
    edit_chat_reply,
    delete_chat_reply,
    get_pending_chat_count,
    ChatMessageModel,
    ChatReplyReq,
    EditMsgReq,
)

pytestmark = pytest.mark.accuracy

CLINIC_ID = "c1111111-1111-1111-1111-111111111111"


class FakeTelegramResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {"result": {"message_id": 999}}

    def json(self):
        return self._payload


class FakeAsyncClient:
    """Records every outgoing 'Telegram API' call instead of hitting the network."""
    calls = []

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, json=None, **kw):
        FakeAsyncClient.calls.append((url, json))
        return FakeTelegramResponse()


@pytest.fixture(autouse=True)
def _reset_fake_client():
    FakeAsyncClient.calls = []
    yield


def _captured_add(mock_db):
    """Wires mock_db.add to remember the object it was given, since the
    ChatMessage instances main.py creates are real (unbound) SQLAlchemy
    model objects we can inspect directly afterward."""
    captured = {}
    def _add(obj):
        captured["msg"] = obj
    mock_db.add.side_effect = _add
    return captured


# =====================================================================
# A. Bi-directional relay: admin -> patient (Telegram / SMS)
# =====================================================================

@pytest.mark.asyncio
async def test_admin_reply_saved_and_forwarded_via_telegram():
    mock_db = MagicMock()
    captured = _captured_add(mock_db)

    req = ChatReplyReq(clinic_id=CLINIC_ID, reply_text="Your appointment is confirmed.", telegram_id=123456789)
    with patch("main.httpx.AsyncClient", FakeAsyncClient):
        res = await reply_chat(req, db=mock_db)

    assert res == {"status": "success"}
    assert mock_db.add.called and mock_db.commit.called
    saved = captured["msg"]
    assert saved.reply == "Your appointment is confirmed."
    assert saved.channel == "telegram"
    assert saved.status == "replied"
    assert saved.message is None  # blank 'message' keeps this on the admin's side of the thread

    # Forwarded to the real Telegram sendMessage endpoint, and the returned
    # message_id is stored so a later edit/delete can find this message.
    assert len(FakeAsyncClient.calls) == 1
    url, payload = FakeAsyncClient.calls[0]
    assert "sendMessage" in url
    assert payload["chat_id"] == 123456789
    assert "Your appointment is confirmed." in payload["text"]
    assert saved.telegram_message_id == 999


@pytest.mark.asyncio
async def test_admin_reply_via_sms_skips_telegram_forward():
    mock_db = MagicMock()
    captured = _captured_add(mock_db)

    req = ChatReplyReq(clinic_id=CLINIC_ID, reply_text="Your appointment is confirmed.", phone="+60123456789")
    with patch("main.httpx.AsyncClient", FakeAsyncClient):
        res = await reply_chat(req, db=mock_db)

    assert res == {"status": "success"}
    assert captured["msg"].channel == "sms"
    assert len(FakeAsyncClient.calls) == 0  # no Telegram call for SMS-only patients


@pytest.mark.asyncio
async def test_admin_edit_reply_propagates_via_edit_message_text():
    mock_db = MagicMock()
    existing = MagicMock(channel="telegram", telegram_message_id=555, telegram_id=123456789, reply="old text")
    mock_db.query.return_value.filter_by.return_value.first.return_value = existing

    req = EditMsgReq(new_text="Updated: your appointment moved to 3pm.")
    with patch("main.httpx.AsyncClient", FakeAsyncClient):
        res = await edit_chat_reply(msg_id=1, req=req, db=mock_db)

    assert res == {"status": "success"}
    assert existing.reply == "Updated: your appointment moved to 3pm."
    assert mock_db.commit.called
    assert len(FakeAsyncClient.calls) == 1
    url, payload = FakeAsyncClient.calls[0]
    assert "editMessageText" in url
    assert payload["message_id"] == 555
    assert payload["chat_id"] == 123456789
    assert "Updated: your appointment moved to 3pm." in payload["text"]


@pytest.mark.asyncio
async def test_admin_edit_reply_missing_message_returns_404():
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await edit_chat_reply(msg_id=999, req=EditMsgReq(new_text="x"), db=mock_db)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_admin_delete_reply_removes_row_and_notifies_telegram():
    mock_db = MagicMock()
    existing = MagicMock(channel="telegram", telegram_message_id=555, telegram_id=123456789)
    mock_db.query.return_value.filter_by.return_value.first.return_value = existing

    with patch("main.httpx.AsyncClient", FakeAsyncClient):
        res = await delete_chat_reply(msg_id=1, db=mock_db)

    assert res == {"status": "success"}
    assert mock_db.delete.called and mock_db.commit.called
    assert len(FakeAsyncClient.calls) == 1
    url, payload = FakeAsyncClient.calls[0]
    assert "deleteMessage" in url
    assert payload["message_id"] == 555


@pytest.mark.asyncio
async def test_admin_delete_reply_missing_message_returns_404():
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await delete_chat_reply(msg_id=999, db=mock_db)
    assert exc_info.value.status_code == 404


def test_ask_admin_does_not_duplicate_chat_message_row():
    """log_all_incoming (bot.py, via /log-chat) already saves the patient's
    hand-off message. /ask-admin must stay a pure notification no-op - a
    regression here (re-adding the old duplicate db.add) would double every
    hand-off message shown in the admin dashboard."""
    mock_db = MagicMock()
    msg = ChatMessageModel(clinic_id=CLINIC_ID, telegram_id=123456789, message="I need help with something else")
    res = ask_admin(msg, db=mock_db)
    assert res == {"status": "success"}
    assert not mock_db.add.called
    assert not mock_db.commit.called


def test_pending_chat_count_reflects_unread_messages():
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.count.return_value = 3
    res = get_pending_chat_count(CLINIC_ID, db=mock_db)
    assert res == {"count": 3}


# =====================================================================
# Overall accuracy score for the FYP report
# =====================================================================

async def _run_all_scenarios():
    results = []

    async def check_async(coro_fn):
        # The autouse _reset_fake_client fixture only fires for tests pytest
        # invokes directly - calling these scenario functions manually here
        # bypasses it, so FakeAsyncClient.calls must be reset by hand before
        # each one or later scenarios see earlier scenarios' leftover calls.
        FakeAsyncClient.calls = []
        try:
            await coro_fn()
            results.append(True)
        except AssertionError:
            results.append(False)

    await check_async(test_admin_reply_saved_and_forwarded_via_telegram)
    await check_async(test_admin_reply_via_sms_skips_telegram_forward)
    await check_async(test_admin_edit_reply_propagates_via_edit_message_text)
    await check_async(test_admin_edit_reply_missing_message_returns_404)
    await check_async(test_admin_delete_reply_removes_row_and_notifies_telegram)
    await check_async(test_admin_delete_reply_missing_message_returns_404)

    for sync_scenario in (
        test_ask_admin_does_not_duplicate_chat_message_row,
        test_pending_chat_count_reflects_unread_messages,
    ):
        FakeAsyncClient.calls = []
        try:
            sync_scenario()
            results.append(True)
        except AssertionError:
            results.append(False)

    return results


@pytest.mark.asyncio
async def test_communication_agent_overall_accuracy(record_property):
    FakeAsyncClient.calls = []
    results = await _run_all_scenarios()
    total = len(results)
    passed = sum(results)

    # Pass specific internal metrics to conftest.py
    record_property("custom_total", total)
    record_property("custom_passed", passed)
    record_property("custom_failed", total - passed)

    assert passed == total