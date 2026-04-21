"use client";

import { useState, useEffect } from 'react';

const CLINIC_ID = "c1111111-1111-1111-1111-111111111111";

const COUNTRIES = [
  "Malaysia", "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", 
  "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", 
  "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", 
  "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", 
  "China", "Colombia", "Comoros", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", 
  "Djibouti", "Dominican Republic", "East Timor", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", 
  "Eritrea", "Estonia", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", 
  "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", 
  "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", 
  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", 
  "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macedonia", "Madagascar", "Malawi", 
  "Maldives", "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", 
  "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", 
  "New Zealand", "Nicaragua", "Niger", "Nigeria", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", 
  "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", 
  "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent", "Samoa", "San Marino", 
  "Sao Tome", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", 
  "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "Spain", "Sri Lanka", "Sudan", 
  "Suriname", "Swaziland", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", 
  "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", 
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", 
  "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

const COUNTRY_PHONE_CODES: Record<string, string> = {
  "MALAYSIA": "+60", "AFGHANISTAN": "+93", "ALBANIA": "+355", "ALGERIA": "+213", "ANDORRA": "+376",
  "ANGOLA": "+244", "ARGENTINA": "+54", "ARMENIA": "+374", "AUSTRALIA": "+61", "AUSTRIA": "+43",
  "AZERBAIJAN": "+994", "BAHAMAS": "+1", "BAHRAIN": "+973", "BANGLADESH": "+880", "BARBADOS": "+1",
  "BELARUS": "+375", "BELGIUM": "+32", "BELIZE": "+501", "BENIN": "+229", "BHUTAN": "+975",
  "BOLIVIA": "+591", "BOSNIA AND HERZEGOVINA": "+387", "BOTSWANA": "+267", "BRAZIL": "+55",
  "BRUNEI": "+673", "BULGARIA": "+359", "BURKINA FASO": "+226", "BURUNDI": "+257",
  "CAMBODIA": "+855", "CAMEROON": "+237", "CANADA": "+1", "CENTRAL AFRICAN REPUBLIC": "+236",
  "CHAD": "+235", "CHILE": "+56", "CHINA": "+86", "COLOMBIA": "+57", "COMOROS": "+269",
  "COSTA RICA": "+506", "CROATIA": "+385", "CUBA": "+53", "CYPRUS": "+357",
  "CZECH REPUBLIC": "+420", "DENMARK": "+45", "DJIBOUTI": "+253",
  "DOMINICAN REPUBLIC": "+1", "EAST TIMOR": "+670", "ECUADOR": "+593", "EGYPT": "+20",
  "EL SALVADOR": "+503", "EQUATORIAL GUINEA": "+240", "ERITREA": "+291", "ESTONIA": "+372",
  "ETHIOPIA": "+251", "FIJI": "+679", "FINLAND": "+358", "FRANCE": "+33",
  "GABON": "+241", "GAMBIA": "+220", "GEORGIA": "+995", "GERMANY": "+49",
  "GHANA": "+233", "GREECE": "+30", "GRENADA": "+1", "GUATEMALA": "+502",
  "GUINEA": "+224", "GUYANA": "+592", "HAITI": "+509", "HONDURAS": "+504",
  "HUNGARY": "+36", "ICELAND": "+354", "INDIA": "+91", "INDONESIA": "+62",
  "IRAN": "+98", "IRAQ": "+964", "IRELAND": "+353", "ISRAEL": "+972", "ITALY": "+39",
  "JAMAICA": "+1", "JAPAN": "+81", "JORDAN": "+962", "KAZAKHSTAN": "+7",
  "KENYA": "+254", "KIRIBATI": "+686", "KUWAIT": "+965", "KYRGYZSTAN": "+996",
  "LAOS": "+856", "LATVIA": "+371", "LEBANON": "+961", "LESOTHO": "+266",
  "LIBERIA": "+231", "LIBYA": "+218", "LIECHTENSTEIN": "+423", "LITHUANIA": "+370",
  "LUXEMBOURG": "+352", "MACEDONIA": "+389", "MADAGASCAR": "+261", "MALAWI": "+265",
  "MALDIVES": "+960", "MALI": "+223", "MALTA": "+356", "MAURITANIA": "+222",
  "MAURITIUS": "+230", "MEXICO": "+52", "MICRONESIA": "+691", "MOLDOVA": "+373",
  "MONACO": "+377", "MONGOLIA": "+976", "MONTENEGRO": "+382", "MOROCCO": "+212",
  "MOZAMBIQUE": "+258", "MYANMAR": "+95", "NAMIBIA": "+264", "NAURU": "+674",
  "NEPAL": "+977", "NETHERLANDS": "+31", "NEW ZEALAND": "+64", "NICARAGUA": "+505",
  "NIGER": "+227", "NIGERIA": "+234", "NORWAY": "+47", "OMAN": "+968",
  "PAKISTAN": "+92", "PALAU": "+680", "PALESTINE": "+970", "PANAMA": "+507",
  "PAPUA NEW GUINEA": "+675", "PARAGUAY": "+595", "PERU": "+51",
  "PHILIPPINES": "+63", "POLAND": "+48", "PORTUGAL": "+351", "QATAR": "+974",
  "ROMANIA": "+40", "RUSSIA": "+7", "RWANDA": "+250",
  "SAINT KITTS AND NEVIS": "+1", "SAINT LUCIA": "+1", "SAINT VINCENT": "+1",
  "SAMOA": "+685", "SAN MARINO": "+378", "SAO TOME": "+239",
  "SAUDI ARABIA": "+966", "SENEGAL": "+221", "SERBIA": "+381",
  "SEYCHELLES": "+248", "SIERRA LEONE": "+232", "SINGAPORE": "+65",
  "SLOVAKIA": "+421", "SLOVENIA": "+386", "SOLOMON ISLANDS": "+677",
  "SOMALIA": "+252", "SOUTH AFRICA": "+27", "SOUTH KOREA": "+82",
  "SPAIN": "+34", "SRI LANKA": "+94", "SUDAN": "+249",
  "SURINAME": "+597", "SWAZILAND": "+268", "SWEDEN": "+46",
  "SWITZERLAND": "+41", "SYRIA": "+963", "TAIWAN": "+886",
  "TAJIKISTAN": "+992", "TANZANIA": "+255", "THAILAND": "+66",
  "TOGO": "+228", "TONGA": "+676", "TRINIDAD AND TOBAGO": "+1",
  "TUNISIA": "+216", "TURKEY": "+90", "TURKMENISTAN": "+993",
  "TUVALU": "+688", "UGANDA": "+256", "UKRAINE": "+380",
  "UNITED ARAB EMIRATES": "+971", "UNITED KINGDOM": "+44",
  "UNITED STATES": "+1", "URUGUAY": "+598",
  "UZBEKISTAN": "+998", "VANUATU": "+678", "VATICAN CITY": "+379",
  "VENEZUELA": "+58", "VIETNAM": "+84", "YEMEN": "+967",
  "ZAMBIA": "+260", "ZIMBABWE": "+263"
};

export default function PatientsPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  
  const [isMalaysian, setIsMalaysian] = useState(true);
  const [formData, setFormData] = useState({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch(`http://127.0.0.1:8000/admin/patients/${CLINIC_ID}`)
      .then(res => res.json())
      .then(data => { setPatients(data); setIsLoading(false); })
      .catch(() => { setIsLoading(false); });
  };

  const handleICChange = (val: string) => {
      if (isMalaysian) {
          let clean = val.replace(/[^0-9]/g, '');
          if (clean.length <= 12) {
              let formatted = clean;
              if (clean.length > 6) formatted = clean.slice(0,6) + '-' + clean.slice(6);
              if (clean.length > 8) formatted = formatted.slice(0,9) + '-' + clean.slice(8);
              
              let gender = formData.gender;
              if (clean.length === 12) {
                  const lastDigit = parseInt(clean[11]);
                  gender = lastDigit % 2 === 0 ? 'FEMALE' : 'MALE';
              }
              setFormData({...formData, ic: formatted, gender: gender, nationality: 'MALAYSIA'});
          }
      } else {
          setFormData({...formData, ic: val.toUpperCase()});
      }
  };

  const handleNationalityChange = (country: string) => {
      const upperCountry = country.toUpperCase();
      setFormData({...formData, nationality: upperCountry});
  };

  const handleSave = async () => {
    if (!formData.ic || !formData.name || !formData.phone) {
        alert("⚠️ IC/Passport, Name, and Phone are required fields."); return;
    }

    const currentPhoneCode = COUNTRY_PHONE_CODES[formData.nationality.toUpperCase()] || "+";
    let formattedLocalPhone = formData.phone.replace(/[\s-]/g, '');
    
    // Prevent user from manually putting country code inside the local part
    if (isMalaysian && formattedLocalPhone.startsWith('0')) {
        formattedLocalPhone = formattedLocalPhone.substring(1);
    }
    
    const finalPhone = currentPhoneCode + formattedLocalPhone;

    if (isMalaysian) {
        const cleanIC = formData.ic.replace(/[^0-9]/g, '');
        if (cleanIC.length !== 12) {
            alert("⚠️ Malaysian IC must be exactly 12 digits or in XXXXXX-XX-XXXX format."); return;
        }
        if (!/^\+60[1-9][0-9]{7,9}$/.test(finalPhone)) {
            alert("⚠️ Invalid Malaysian phone number format."); return;
        }
    } else {
        if(!/^\+?[0-9]{7,15}$/.test(finalPhone.replace(/[\s\-\(\)]/g, ''))) {
            alert("⚠️ Invalid phone number format."); return;
        }
    }

    if (!window.confirm("Are you sure this details are correct?")) return;

    try {
        const isEditing = !!editingPatient;
        const url = isEditing ? `http://127.0.0.1:8000/admin/patients/${editingPatient.ic_passport_number}` : `http://127.0.0.1:8000/register-patient`;
        
        const payload = isEditing ? { 
            ic_passport_number: formData.ic.toUpperCase(), 
            name: formData.name.toUpperCase(), 
            phone: finalPhone, 
            gender: formData.gender.toUpperCase(), 
            nationality: formData.nationality.toUpperCase(), 
            address: formData.address.toUpperCase() 
        } : { 
            clinic_id: CLINIC_ID, 
            ic_passport_number: formData.ic.toUpperCase(), 
            name: formData.name.toUpperCase(), 
            phone: finalPhone, 
            gender: formData.gender.toUpperCase(), 
            nationality: formData.nationality.toUpperCase(), 
            address: formData.address.toUpperCase() 
        };

        const res = await fetch(url, { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        
        if (data.status === "error") { alert("⚠️ " + data.reason); return; }
        
        setShowModal(false);
        loadData();
    } catch (e) {
        alert("⚠️ Failed to save. Check your connection.");
    }
  };

  const handleDelete = async (ic: string) => {
    if(confirm("Are you sure you want to delete this patient?")) {
      await fetch(`http://127.0.0.1:8000/admin/patients/${ic}`, { method: 'DELETE' }); loadData();
    }
  };

  const openModal = (patient: any = null) => {
    setEditingPatient(patient);
    if(patient) {
        const isMy = patient.nationality.toUpperCase() === 'MALAYSIA';
        setIsMalaysian(isMy);
        
        // Strip country code for the editable part
        const cCode = COUNTRY_PHONE_CODES[patient.nationality.toUpperCase()] || "+";
        let localPhonePart = patient.phone;
        if (localPhonePart.startsWith(cCode)) {
            localPhonePart = localPhonePart.slice(cCode.length);
        }

        setFormData({ 
            ic: patient.ic_passport_number, 
            name: patient.name, 
            phone: localPhonePart, 
            gender: patient.gender, 
            nationality: patient.nationality, 
            address: patient.address || '' 
        });
    } else {
        setIsMalaysian(true);
        setFormData({ ic: '', name: '', phone: '', gender: 'MALE', nationality: 'MALAYSIA', address: '' });
    }
    setShowModal(true);
  };

  const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.ic_passport_number.includes(search));

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div><h1 className="text-3xl font-bold text-slate-800">👥 Patient Directory</h1></div>
        <div className="flex gap-4">
          <input type="text" placeholder="Search Name or IC..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-4 py-2 border rounded-lg outline-none w-64" />
          <button onClick={() => openModal()} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-md">+ Add Patient</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 font-semibold text-slate-600">Patient Details</th>
              <th className="p-4 font-semibold text-slate-600">IC / Passport</th>
              <th className="p-4 font-semibold text-slate-600">Contact</th>
              <th className="p-4 font-semibold text-slate-600 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((p, i) => (
              <tr key={p.ic_passport_number} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="p-4">
                  <div className="font-bold text-slate-800">{p.name}</div>
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">{p.gender}</span>
                  <span className="text-xs text-slate-500 ml-2">{p.nationality}</span>
                </td>
                <td className="p-4 font-mono text-slate-600">{p.ic_passport_number}</td>
                <td className="p-4 text-slate-600">{p.phone}</td>
                <td className="p-4 text-center space-x-2">
                  <button onClick={() => openModal(p)} className="px-3 py-1 bg-slate-100 rounded text-sm font-medium text-slate-600 hover:bg-slate-200">Edit</button>
                  <button onClick={() => handleDelete(p.ic_passport_number)} className="px-3 py-1 bg-red-100 text-red-600 rounded text-sm font-medium hover:bg-red-200">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-[450px] shadow-2xl">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">{editingPatient ? 'Modify Patient Data' : 'Add New Patient'}</h3>
            
            <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                <button onClick={() => { setIsMalaysian(true); setFormData({...formData, nationality: 'MALAYSIA', ic: '', phone: ''}); }} className={`flex-1 py-1 text-sm font-bold rounded ${isMalaysian ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Malaysian</button>
                <button onClick={() => { setIsMalaysian(false); setFormData({...formData, ic: '', nationality: '', phone: ''}); }} className={`flex-1 py-1 text-sm font-bold rounded ${!isMalaysian ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Non-Malaysian</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{isMalaysian ? "IC Number" : "Passport Number"}</label>
                <input type="text" placeholder={isMalaysian ? "e.g. 900101-14-5533" : "Passport ID"} value={formData.ic} onChange={e => handleICChange(e.target.value)} className="w-full p-3 border rounded-lg outline-none font-mono uppercase" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Patient Full Name</label>
                <input type="text" placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg outline-none uppercase" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Home Address</label>
                <input type="text" placeholder="Full Address" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg outline-none uppercase" />
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Gender</label>
                  <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg outline-none bg-white uppercase">
                    <option value="MALE">MALE</option>
                    <option value="FEMALE">FEMALE</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Nationality</label>
                  {isMalaysian ? (
                      <input type="text" readOnly value="MALAYSIA" className="w-full p-3 border bg-slate-50 rounded-lg outline-none font-bold text-slate-500 uppercase" />
                  ) : (
                      <select value={formData.nationality} onChange={e => handleNationalityChange(e.target.value)} className="w-full p-3 border rounded-lg outline-none bg-white uppercase">
                        <option value="">-- Select Country --</option>
                        {COUNTRIES.map(c => <option key={c} value={c.toUpperCase()}>{c.toUpperCase()}</option>)}
                      </select>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number</label>
                <div className="flex">
                    <div className="p-3 border-y border-l rounded-l-lg bg-slate-100 text-slate-500 font-mono font-bold flex items-center justify-center min-w-[3rem]">
                        {COUNTRY_PHONE_CODES[formData.nationality.toUpperCase()] || "+"}
                    </div>
                    <input 
                      type="text" 
                      placeholder="123456789" 
                      value={formData.phone} 
                      onChange={e => setFormData({...formData, phone: e.target.value})} 
                      disabled={!isMalaysian && !formData.nationality}
                      className={`w-full p-3 border rounded-r-lg outline-none font-mono ${(!isMalaysian && !formData.nationality) ? 'bg-slate-100 cursor-not-allowed text-slate-400' : ''}`} 
                    />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">Save Patient</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}