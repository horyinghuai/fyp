"""
fake_db.py - a small hand-rolled SQLAlchemy Session double.

Why not just MagicMock (like test_agent.py does)? MagicMock's `.filter().first()`
/`.all()` chains only work if you get the CALL ORDER exactly right, because a
plain MagicMock returns the same child mock for every `.query(X)` call
regardless of what X is. That's fine for the 1-2 call functions in
test_agent.py, but validate_vaccine_booking() and get_next_vaccine_dose()
make 4-6 different queries against different models in a specific order that
depends on which branch is taken - order-dependent side_effect lists would be
extremely fragile and break silently if main.py is refactored.

FakeSession instead keys its canned data by MODEL CLASS. It doesn't care what
order queries happen in, or how many times a model is queried - only which
model. This makes the vaccine-dependency evaluation tests robust to
refactoring of the query chains themselves.
"""


class FakeQuery:
    def __init__(self, rows):
        self._rows = list(rows) if rows else []

    # chain methods are all no-ops that just return self
    def select_from(self, *a, **kw): return self
    def join(self, *a, **kw): return self
    def filter(self, *a, **kw): return self
    def filter_by(self, *a, **kw): return self
    def order_by(self, *a, **kw): return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)


class FakeSession:
    """table_data: {ModelClass: [row, row, ...]}
    For db.query(Model) -> rows should be model instances.
    For db.query(Model.col1, Model.col2, ...) -> rows should be tuples in
    that column order (first entity's class determines the lookup key).
    """
    def __init__(self, table_data: dict):
        self.table_data = table_data

    def query(self, *entities, **kwargs):
        first = entities[0]
        model = getattr(first, "class_", first)  # InstrumentedAttribute -> owning class
        return FakeQuery(self.table_data.get(model, []))

    def add(self, *a, **kw): pass
    def flush(self): pass
    def commit(self): pass
    def rollback(self): pass
    def close(self): pass
