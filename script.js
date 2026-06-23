// ==================== CONFIGURATION ====================
let CONFIG = {
    operating247: true,
    customHours: "24/7 Available",
    whatsappNumber: "919480324895",
    businessName: "Rapid Travels"
};
const GAS_URL = "https://script.google.com/macros/s/AKfycbwFls5uasexKXAPPkRrjJ6xwLML-yS0u5GnsHwr3YxOxItT6fg16JPR6XT7IL3Ui5t6/exec"; // REPLACE WITH YOUR ACTUAL URL
let formStartTime = Date.now();
let isSubmitting = false;        // guards against double-submit (accidental double tap)
let currentBookingId = null;     // generated once, reused on retries so duplicates share one ID

// ==================== HELPER: Format Date in IST (DD-MMM-YYYY) ====================
function formatDateIST(dateStr) {
    const [year, month, day] = dateStr.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${day}-${months[parseInt(month)-1]}-${year}`;
}

// ==================== HELPER: Format Time in IST (hh:mm AM/PM) ====================
function formatTimeIST(time24) {
    let [hours, minutes] = time24.split(':');
    hours = parseInt(hours);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    let hour12 = hours % 12;
    if (hour12 === 0) hour12 = 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// ==================== HELPER: Format Full DateTime in IST ====================
function formatDateTimeIST(dateStr, timeStr) {
    return `${formatDateIST(dateStr)} at ${formatTimeIST(timeStr)}`;
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    setupDatePicker();
    setupTripTypeToggle();
    setupServiceTypeToggle();
    setupMultiStop();
    setupFormSubmit();
    restoreFromLocalStorage();
    removeLoadingOverlay();
    carouselInit();
    preloadAllStations();
    loadFareChart();
    // Show fare quick-picks when user types pickup
    const pickupEl = document.getElementById('pickup');
    if (pickupEl) pickupEl.addEventListener('input', () => setTimeout(renderFareQuickPicks, 300));
});

function removeLoadingOverlay() {
    setTimeout(() => {
        let ov = document.getElementById('loadingOverlay');
        if (ov) { ov.style.opacity = '0'; setTimeout(() => ov.style.display = 'none', 500); }
    }, 500);
}

// ==================== LOAD CONFIG FROM SHEET ====================
async function loadConfig() {
    try {
        let res = await fetch(`${GAS_URL}?action=getConfig`);
        if (res.ok) {
            let data = await res.json();
            if (data.success) {
                CONFIG = { ...CONFIG, ...data.config };
                updateStatusDisplay();
                updateFooterHours();
            }
        }
    } catch(e) { console.log(e); }
}

function updateStatusDisplay() {
    let dot = document.getElementById('statusDot'), txt = document.getElementById('statusText'), hrs = document.getElementById('hoursText');
    if (CONFIG.operating247) {
        dot.classList.remove('closed');
        txt.innerHTML = '🟢 We are open 24/7';
        if (hrs) hrs.innerHTML = 'Available anytime, day or night';
    } else {
        dot.classList.add('closed');
        txt.innerHTML = '🔴 Limited Hours';
        if (hrs) hrs.innerHTML = CONFIG.customHours;
    }
}

function updateFooterHours() {
    let el = document.getElementById('footerHours');
    if (el) el.innerHTML = CONFIG.operating247 ? '🟢 24/7 Available<br>Call anytime' : CONFIG.customHours;
}

// ==================== DATE & TIME VALIDATION ====================
function setupDatePicker() {
    let inp = document.getElementById('journeyDate');
    if (!inp) return;
    const now = new Date();
    // If current time is past 22:00, block today — earliest booking is tomorrow
    const minDate = now.getHours() >= 22
        ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
        : now;
    inp.min = minDate.toISOString().split('T')[0];
    // Also set ticket date min
    let tktDate = document.getElementById('tkt-date');
    if (tktDate) tktDate.min = minDate.toISOString().split('T')[0];
}

function isPastDateTime(dateStr, timeStr) {
    let sel = new Date(`${dateStr}T${timeStr}:00`);
    let now = new Date();
    let minAllowed = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour buffer
    return sel < minAllowed;
}

// ==================== LOCALSTORAGE: remember name & phone ====================
function restoreFromLocalStorage() {
    const name = localStorage.getItem('rpc_name');
    const phone = localStorage.getItem('rpc_phone');
    if (name) { let el = document.getElementById('fullName'); if (el) el.value = name; }
    if (phone) { let el = document.getElementById('phone'); if (el) el.value = phone; }
}

function saveToLocalStorage(name, phone) {
    if (name) localStorage.setItem('rpc_name', name);
    if (phone) localStorage.setItem('rpc_phone', phone);
}

// ==================== SERVICE TYPE TOGGLE (ride vs ticket) ====================
const TICKET_SERVICES = ['Train Ticket Booking', 'Bus Ticket Booking', 'Flight Ticket Booking'];

function setupServiceTypeToggle() {
    const st = document.getElementById('serviceType');
    if (!st) return;
    st.addEventListener('change', applyServiceMode);
}

function applyServiceMode() {
    const st = document.getElementById('serviceType');
    const isTicket = TICKET_SERVICES.includes(st.value);
    const rideFields = ['tripType', 'pickup', 'drop', 'roundTripFields', 'multiStopFields', 'passengers', 'luggage', 'pickupTime'];
    const rideLabels = document.querySelectorAll('.ride-only');
    rideFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.closest('.form-group, div') && (el.parentElement.style.display = isTicket ? 'none' : '');
            // For named fields wrap in form-group check
            const grp = el.closest('.form-group');
            if (grp) grp.style.display = isTicket ? 'none' : '';
            if (id === 'roundTripFields' || id === 'multiStopFields') el.style.display = 'none';
        }
    });
    // Also hide the tripType row
    const tt = document.getElementById('tripType');
    if (tt) { const grp = tt.closest('.form-group'); if (grp) grp.style.display = isTicket ? 'none' : ''; }
    // Pickup & Drop
    ['pickup','drop','pickupTime'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { const grp = el.closest('.form-group'); if (grp) grp.style.display = isTicket ? 'none' : ''; }
    });
    // Passengers & luggage row
    const paxGrp = document.getElementById('passengers')?.closest('.form-row');
    if (paxGrp) paxGrp.style.display = isTicket ? 'none' : '';
    // Journey date row label
    const jdGrp = document.getElementById('journeyDate')?.closest('.form-row');
    if (jdGrp) jdGrp.style.display = isTicket ? 'none' : '';
    // Ticket hint
    let hint = document.getElementById('ticketHint');
    if (isTicket && !hint) {
        hint = document.createElement('div');
        hint.id = 'ticketHint';
        hint.style.cssText = 'background:#fff3cd;border-radius:8px;padding:14px;margin-bottom:16px;font-size:0.9rem;color:#856404;';
        hint.innerHTML = '<i class="fas fa-info-circle"></i> For ticket bookings, please use the <strong>Book a Ticket Online</strong> section below — it has a dedicated form. Or just describe your requirement in the Landmark / Instructions field above.';
        const form = document.getElementById('bookingForm');
        form.insertBefore(hint, form.querySelector('.form-group'));
    } else if (!isTicket && hint) {
        hint.remove();
    }
}

// ==================== TRIP TYPE TOGGLE ====================
function setupTripTypeToggle() {
    let tt = document.getElementById('tripType'), rf = document.getElementById('roundTripFields'), mf = document.getElementById('multiStopFields'), dl = document.getElementById('dropLabel');
    tt.addEventListener('change', () => {
        let v = tt.value;
        rf.style.display = v === 'roundtrip' ? 'block' : 'none';
        mf.style.display = v === 'multistop' ? 'block' : 'none';
        dl.innerText = v === 'multistop' ? 'Final Drop Location *' : 'Drop Location *';
        document.getElementById('returnDate').required = (v === 'roundtrip');
        document.getElementById('returnTime').required = (v === 'roundtrip');
    });
}

// ==================== MULTI-STOP DYNAMIC FIELDS ====================
let stopCount = 1;
const MAX_STOPS = 3;

function setupMultiStop() {
    let btn = document.getElementById('addStopBtn');
    if (btn) btn.addEventListener('click', addStopField);
}

function addStopField() {
    if (stopCount >= MAX_STOPS) { showToast(`Maximum ${MAX_STOPS} stops allowed`, 'error'); return; }
    stopCount++;
    let cont = document.getElementById('stopsContainer');
    let div = document.createElement('div');
    div.className = 'stop-entry';
    div.innerHTML = `<div class="form-row"><div class="form-group"><label>Stop ${stopCount} Location</label><input type="text" class="stop-location" placeholder="e.g., Gateway of India"></div><div class="form-group"><label>Halt (minutes)</label><input type="number" class="stop-halt" placeholder="30" min="0" step="10"></div></div><button type="button" class="remove-stop-btn" onclick="this.parentElement.remove(); stopCount--;">Remove stop</button>`;
    cont.appendChild(div);
}

// ==================== FORM SUBMISSION ====================
function setupFormSubmit() {
    document.getElementById('bookingForm').addEventListener('submit', handleFormSubmit);
}

function collectFormData() {
    let tripType = document.getElementById('tripType').value;
    let stops = [];
    if (tripType === 'multistop') {
        let locs = document.querySelectorAll('.stop-location'), halts = document.querySelectorAll('.stop-halt');
        for (let i = 0; i < locs.length; i++) {
            if (locs[i].value.trim()) stops.push({ location: locs[i].value.trim(), halt: halts[i].value ? parseInt(halts[i].value) : 0 });
        }
    }
    return {
        bookingId: currentBookingId,
        fullName: document.getElementById('fullName').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        email: document.getElementById('email').value.trim(),
        serviceType: document.getElementById('serviceType').value,
        tripType: tripType,
        pickup: document.getElementById('pickup').value.trim(),
        drop: document.getElementById('drop').value.trim(),
        returnDate: document.getElementById('returnDate').value,
        returnTime: document.getElementById('returnTime').value,
        returnDrop: document.getElementById('returnDrop').value.trim(),
        stops: stops,
        landmark: document.getElementById('landmark').value.trim(),
        journeyDate: document.getElementById('journeyDate').value,
        pickupTime: document.getElementById('pickupTime').value,
        passengers: document.getElementById('passengers').value,
        luggage: document.getElementById('luggage').value,
        timestamp: new Date().toISOString(),
        status: 'Pending'
    };
}

function validateForm() {
    // Honeypot
    if (document.getElementById('website').value !== "") { showToast("Spam detected. Please try again.", "error"); return false; }
    // Time validation
    let timeTaken = (Date.now() - formStartTime) / 1000;
    if (timeTaken < 5) { showToast("Please take a moment to fill the form properly.", "error"); return false; }
    // Required fields
    let required = ['fullName', 'phone', 'email', 'serviceType', 'pickup', 'drop', 'journeyDate', 'pickupTime', 'passengers'];
    for (let f of required) {
        let el = document.getElementById(f);
        if (!el.value.trim()) { showToast(`Please fill ${el.previousElementSibling.innerText}`, 'error'); el.focus(); return false; }
    }
    // Passenger limit (max 4)
    let passengers = parseInt(document.getElementById('passengers').value);
    if (passengers > 4) {
        showToast("For more than 4 passengers, please call us directly on 94803 24895.", "error");
        return false;
    }
    let journeyDate = document.getElementById('journeyDate').value, pickupTime = document.getElementById('pickupTime').value;
    if (isPastDateTime(journeyDate, pickupTime)) { showToast("Cannot book for a past time. Please select a future time (at least 1 hour from now).", "error"); return false; }
    let tripType = document.getElementById('tripType').value;
    if (tripType === 'roundtrip') {
        let retDate = document.getElementById('returnDate').value, retTime = document.getElementById('returnTime').value;
        if (!retDate || !retTime) { showToast('Please provide return date and time for round trip', 'error'); return false; }
        let journey = new Date(journeyDate), ret = new Date(retDate);
        if (ret < journey) { showToast('Return date cannot be earlier than journey date', 'error'); return false; }
        let today = new Date().toISOString().slice(0, 10);
        if (retDate === today && isPastDateTime(retDate, retTime)) { showToast("Return pickup time cannot be in the past.", "error"); return false; }
    }
    if (tripType === 'multistop') {
        let locs = document.querySelectorAll('.stop-location');
        let hasValid = false;
        for (let i = 0; i < locs.length; i++) if (locs[i].value.trim()) hasValid = true;
        if (!hasValid && locs.length > 0) { showToast('Please add at least one valid stop location', 'error'); return false; }
    }
    let phone = document.getElementById('phone').value;
    if (!/^\d{10}$/.test(phone)) { showToast('Invalid 10-digit mobile number', 'error'); return false; }
    let email = document.getElementById('email').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Invalid email', 'error'); return false; }
    return true;
}

function generateBookingId() {
    let prefix = 'RPC';
    let d = new Date();
    let ts = d.getFullYear().toString().slice(-2) + (d.getMonth() + 1).toString().padStart(2, '0') + d.getDate().toString().padStart(2, '0') + d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0') + d.getSeconds().toString().padStart(2, '0');
    let rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${ts}${rand}`;
}

// ==================== VEHICLE AVAILABILITY ====================
async function checkVehicleAvailability(date, time) {
    try {
        let res = await fetch(`${GAS_URL}?action=checkAvailability&date=${date}&time=${time}`);
        return await res.json();
    } catch (e) { return { available: true, availableCount: 1, message: 'Available' }; }
}

async function saveBookingToSheet(data) {
    try {
        // text/plain keeps this a "simple" request (no CORS preflight), and dropping
        // no-cors lets us actually read the server's response (success / duplicate / error).
        const res = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'saveBooking', data: data })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        return { success: result.success !== false, duplicate: result.duplicate === true, error: result.error };
    } catch (e) { console.log(e); return { success: false }; }
}

// ==================== CAROUSEL ====================
let carouselIndex = 0;
let carouselTimer = null;

function carouselInit() {
    const track = document.getElementById('carouselTrack');
    const dotsEl = document.getElementById('carouselDots');
    if (!track || !dotsEl) return;
    const slides = track.querySelectorAll('.carousel-slide');
    if (!slides.length) return;
    dotsEl.innerHTML = Array.from(slides).map((_, i) =>
        `<button class="carousel-dot${i === 0 ? ' active' : ''}" onclick="carouselGoTo(${i})" aria-label="Slide ${i+1}"></button>`
    ).join('');
    carouselGoTo(0);
    carouselAutoPlay();
}

function carouselGoTo(idx) {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    const slides = track.querySelectorAll('.carousel-slide');
    carouselIndex = (idx + slides.length) % slides.length;
    track.style.transform = `translateX(-${carouselIndex * 100}%)`;
    document.querySelectorAll('.carousel-dot').forEach((d, i) =>
        d.classList.toggle('active', i === carouselIndex));
}

function carouselMove(dir) {
    carouselGoTo(carouselIndex + dir);
    carouselAutoPlay(); // reset timer on manual nav
}
window.carouselMove = carouselMove;
window.carouselGoTo = carouselGoTo;

function carouselAutoPlay() {
    if (carouselTimer) clearInterval(carouselTimer);
    carouselTimer = setInterval(() => carouselGoTo(carouselIndex + 1), 4500);
}

// ==================== FARE CHART & QUICK-PICKS ====================
let fareChart = [];

async function loadFareChart() {
    if (fareChart.length) return fareChart;
    const cached = sessionStorage.getItem('rpc_fare_chart');
    if (cached) { fareChart = JSON.parse(cached); renderFareQuickPicks(); return fareChart; }
    if (!CONFIG.gasUrl) return [];
    try {
        const res = await fetch(`${CONFIG.gasUrl}?action=getFareChart`);
        const data = await res.json();
        if (data.success) {
            fareChart = data.fares || [];
            sessionStorage.setItem('rpc_fare_chart', JSON.stringify(fareChart));
            renderFareQuickPicks();
        }
    } catch(e) {}
    return fareChart;
}

function renderFareQuickPicks() {
    const pickup = (document.getElementById('pickup')?.value || '').toLowerCase().trim();
    const container = document.getElementById('fare-quick-picks');
    if (!container) return;
    const matches = fareChart.filter(f => pickup && f.from.toLowerCase().includes(pickup));
    if (!matches.length) { container.innerHTML = ''; return; }
    container.innerHTML = `<div class="fare-picks-label">Quick destinations from <strong>${matches[0].from}</strong>:</div>` +
        matches.map(f => {
            const fareLabel = f.baseFare ? `₹${f.baseFare.toLocaleString('en-IN')}` : `₹${f.perKm}/km`;
            return `<button type="button" class="fare-pick-btn" onclick="applyFarePick('${f.to}','${f.baseFare}','${f.distance}')">
                ${f.to} <span class="fare-badge">${fareLabel}</span>
            </button>`;
        }).join('');
}

function applyFarePick(to, fare, distance) {
    const dropEl = document.getElementById('drop');
    if (dropEl) dropEl.value = to;
    // Store suggested fare for admin reference (shown after booking in WhatsApp)
    window._suggestedFare = fare;
    window._suggestedDistance = distance;
    document.getElementById('fare-quick-picks').innerHTML = `<div class="fare-picks-label" style="color:var(--gold);">✓ Drop set: <strong>${to}</strong>${fare > 0 ? ' — Estimated fare: <strong>₹' + parseInt(fare).toLocaleString('en-IN') + '</strong>' : ''}</div>`;
}
window.applyFarePick = applyFarePick;

// ==================== STATION AUTOCOMPLETE ====================
const stationCache = {};

// Local seed — instant fallback even before GAS is deployed.
// GAS Sheet data merges in on top when available.
const STATION_SEED = {
    Train: [
        {n:'Hubballi Junction (UBL)',c:'Hubballi,KA'},{n:'Dharwad (DWR)',c:'Dharwad,KA'},
        {n:'Belagavi (BGM)',c:'Belagavi,KA'},{n:'Davangere (DVG)',c:'Davangere,KA'},
        {n:'Hospet Junction (HPT)',c:'Hospet,KA'},{n:'Gadag Junction (GDG)',c:'Gadag,KA'},
        {n:'Haveri (HVR)',c:'Haveri,KA'},{n:'Ranibennur (RNR)',c:'Ranibennur,KA'},
        {n:'Londa Junction (LD)',c:'Londa,KA'},{n:'Karwar (KAWR)',c:'Karwar,KA'},
        {n:'Bengaluru City Junction (SBC)',c:'Bengaluru,KA'},{n:'Yeshvantpur Junction (YPR)',c:'Bengaluru,KA'},
        {n:'Mysuru Junction (MYS)',c:'Mysuru,KA'},{n:'Mangaluru Junction (MAJN)',c:'Mangaluru,KA'},
        {n:'Shivamogga Town (SMET)',c:'Shivamogga,KA'},{n:'Hassan (HAS)',c:'Hassan,KA'},
        {n:'Kalaburagi (GR)',c:'Kalaburagi,KA'},{n:'Vijayapura (BJP)',c:'Vijayapura,KA'},
        {n:'Ballari Junction (BAY)',c:'Ballari,KA'},{n:'Udupi (UD)',c:'Udupi,KA'},
        {n:'Mumbai CSMT (CSMT)',c:'Mumbai,MH'},{n:'Mumbai Central (BCT)',c:'Mumbai,MH'},
        {n:'Lokmanya Tilak Terminus (LTT)',c:'Mumbai,MH'},{n:'Pune Junction (PUNE)',c:'Pune,MH'},
        {n:'Nagpur Junction (NGP)',c:'Nagpur,MH'},{n:'Kolhapur (KOP)',c:'Kolhapur,MH'},
        {n:'Miraj Junction (MRJ)',c:'Miraj,MH'},{n:'Solapur (SUR)',c:'Solapur,MH'},
        {n:'Madgaon / Goa (MAO)',c:'Goa'},{n:'Vasco Da Gama (VSG)',c:'Goa'},
        {n:'Hyderabad Deccan (HYB)',c:'Hyderabad,TS'},{n:'Secunderabad Junction (SC)',c:'Hyderabad,TS'},
        {n:'Chennai Central (MAS)',c:'Chennai,TN'},{n:'Coimbatore Junction (CBE)',c:'Coimbatore,TN'},
        {n:'New Delhi (NDLS)',c:'Delhi'},{n:'Hazrat Nizamuddin (NZM)',c:'Delhi'},
        {n:'Jaipur Junction (JP)',c:'Jaipur,RJ'},{n:'Ahmedabad Junction (ADI)',c:'Ahmedabad,GJ'},
        {n:'Surat (ST)',c:'Surat,GJ'},{n:'Vadodara Junction (BRC)',c:'Vadodara,GJ'},
        {n:'Kolkata Howrah (HWH)',c:'Kolkata,WB'},{n:'Lucknow Charbagh (LKO)',c:'Lucknow,UP'},
        {n:'Varanasi Junction (BSB)',c:'Varanasi,UP'},{n:'Bhopal Junction (BPL)',c:'Bhopal,MP'},
        {n:'Tirupati (TPTY)',c:'Tirupati,AP'},{n:'Kochi Ernakulam (ERS)',c:'Kochi,KL'},
        {n:'Thiruvananthapuram (TVC)',c:'Trivandrum,KL'},{n:'Amritsar Junction (ASR)',c:'Amritsar,PB'}
    ],
    Bus: [
        {n:'Hubballi NWKRTC Bus Stand',c:'Hubballi,KA'},{n:'Dharwad Bus Stand',c:'Dharwad,KA'},
        {n:'Belagavi Central Bus Stand',c:'Belagavi,KA'},{n:'Davangere Bus Stand',c:'Davangere,KA'},
        {n:'Hospet Bus Stand',c:'Hospet,KA'},{n:'Gadag Bus Stand',c:'Gadag,KA'},
        {n:'Haveri Bus Stand',c:'Haveri,KA'},{n:'Ranibennur Bus Stand',c:'Ranibennur,KA'},
        {n:'Sirsi Bus Stand',c:'Sirsi,KA'},{n:'Karwar Bus Stand',c:'Karwar,KA'},
        {n:'Bengaluru Majestic KSRTC',c:'Bengaluru,KA'},{n:'Bengaluru Satellite Bus Stand',c:'Bengaluru,KA'},
        {n:'Mysuru Central Bus Stand',c:'Mysuru,KA'},{n:'Mangaluru KSRTC Bus Stand',c:'Mangaluru,KA'},
        {n:'Shivamogga Bus Stand',c:'Shivamogga,KA'},{n:'Hassan Bus Stand',c:'Hassan,KA'},
        {n:'Kalaburagi Bus Stand',c:'Kalaburagi,KA'},{n:'Vijayapura Bus Stand',c:'Vijayapura,KA'},
        {n:'Ballari Bus Stand',c:'Ballari,KA'},{n:'Udupi Bus Stand',c:'Udupi,KA'},
        {n:'Pune Swargate Bus Stand',c:'Pune,MH'},{n:'Kolhapur Bus Stand',c:'Kolhapur,MH'},
        {n:'Solapur Bus Stand',c:'Solapur,MH'},{n:'Nashik CBS',c:'Nashik,MH'},
        {n:'Mumbai Dadar Bus Terminal',c:'Mumbai,MH'},{n:'Panaji Kadamba Bus Stand',c:'Goa'},
        {n:'Hyderabad MGBS',c:'Hyderabad,TS'},{n:'Chennai Koyambedu CMBT',c:'Chennai,TN'},
        {n:'Coimbatore CBS',c:'Coimbatore,TN'},{n:'Koppal Bus Stand',c:'Koppal,KA'}
    ],
    Flight: [
        {n:'Hubballi Airport (HBX)',c:'Hubballi,India'},{n:'Bengaluru Kempegowda Intl (BLR)',c:'Bengaluru,India'},
        {n:'Mumbai Chhatrapati Shivaji Intl (BOM)',c:'Mumbai,India'},{n:'Delhi Indira Gandhi Intl (DEL)',c:'Delhi,India'},
        {n:'Chennai Intl (MAA)',c:'Chennai,India'},{n:'Hyderabad Rajiv Gandhi Intl (HYD)',c:'Hyderabad,India'},
        {n:'Kolkata Netaji Subhas Intl (CCU)',c:'Kolkata,India'},{n:'Kochi Intl (COK)',c:'Kochi,India'},
        {n:'Goa Dabolim (GOI)',c:'Goa,India'},{n:'Goa Mopa Manohar Intl (GOX)',c:'Goa,India'},
        {n:'Pune Airport (PNQ)',c:'Pune,India'},{n:'Ahmedabad Sardar Patel Intl (AMD)',c:'Ahmedabad,India'},
        {n:'Mangaluru Intl (IXE)',c:'Mangaluru,India'},{n:'Coimbatore Intl (CJB)',c:'Coimbatore,India'},
        {n:'Thiruvananthapuram Intl (TRV)',c:'Trivandrum,India'},{n:'Calicut Intl (CCJ)',c:'Kozhikode,India'},
        {n:'Jaipur Intl (JAI)',c:'Jaipur,India'},{n:'Nagpur Dr Ambedkar Intl (NAG)',c:'Nagpur,India'},
        {n:'Belagavi Airport (IXG)',c:'Belagavi,India'},{n:'Mysuru Airport (MYQ)',c:'Mysuru,India'},
        {n:'Dubai Intl (DXB)',c:'Dubai,UAE'},{n:'Abu Dhabi Intl (AUH)',c:'Abu Dhabi,UAE'},
        {n:'Sharjah Intl (SHJ)',c:'Sharjah,UAE'},{n:'Doha Hamad Intl (DOH)',c:'Doha,Qatar'},
        {n:'Muscat Intl (MCT)',c:'Muscat,Oman'},{n:'Kuwait Intl (KWI)',c:'Kuwait City,Kuwait'},
        {n:'Riyadh King Khalid Intl (RUH)',c:'Riyadh,Saudi Arabia'},{n:'Jeddah King Abdulaziz Intl (JED)',c:'Jeddah,Saudi Arabia'},
        {n:'Singapore Changi (SIN)',c:'Singapore'},{n:'Kuala Lumpur Intl (KUL)',c:'Malaysia'},
        {n:'Bangkok Suvarnabhumi (BKK)',c:'Bangkok,Thailand'},{n:'London Heathrow (LHR)',c:'London,UK'},
        {n:'Frankfurt Intl (FRA)',c:'Frankfurt,Germany'},{n:'Paris Charles de Gaulle (CDG)',c:'Paris,France'},
        {n:'New York JFK (JFK)',c:'New York,USA'},{n:'Los Angeles Intl (LAX)',c:'Los Angeles,USA'},
        {n:'Sydney Kingsford Smith (SYD)',c:'Sydney,Australia'},{n:'Colombo Bandaranaike (CMB)',c:'Colombo,Sri Lanka'},
        {n:'Kathmandu Tribhuvan (KTM)',c:'Kathmandu,Nepal'},{n:'Hong Kong Intl (HKG)',c:'Hong Kong'}
    ]
};

function seedToStations(type) {
    return STATION_SEED[type].map(s => {
        if (type === 'Train')  return { 'Station Name': s.n, 'Code': '', 'City': s.c, 'State': '' };
        if (type === 'Bus')    return { 'Stand Name': s.n, 'City': s.c, 'State': '' };
        return { 'Airport Name': s.n, 'IATA': '', 'City': s.c, 'Country': s.c.split(',')[1] || 'India' };
    });
}

async function loadStations(type) {
    if (stationCache[type]) return stationCache[type];
    const key = `rpc_stations_${type}`;
    const cached = sessionStorage.getItem(key);
    if (cached) { stationCache[type] = JSON.parse(cached); return stationCache[type]; }

    // Use seed immediately so typing works right away
    stationCache[type] = seedToStations(type);
    buildDatalist(stationCache[type], type);

    // Then fetch from GAS in background and upgrade if available
    if (CONFIG.gasUrl) {
        try {
            const res = await fetch(`${CONFIG.gasUrl}?action=getStations&type=${type}`);
            const data = await res.json();
            if (data.success && data.stations && data.stations.length > 0) {
                stationCache[type] = data.stations;
                sessionStorage.setItem(key, JSON.stringify(data.stations));
                buildDatalist(stationCache[type], type); // upgrade datalist silently
            }
        } catch(e) {}
    }
    return stationCache[type];
}

function buildDatalist(stations, type) {
    const listId = 'dl-stations';
    let dl = document.getElementById(listId);
    if (!dl) { dl = document.createElement('datalist'); dl.id = listId; document.body.appendChild(dl); }
    dl.innerHTML = '';
    stations.forEach(s => {
        const opt = document.createElement('option');
        if (type === 'Train') {
            opt.value = `${s['Station Name']} (${s['Code']})`;
            opt.label = s['City'] + ', ' + s['State'];
        } else if (type === 'Bus') {
            opt.value = s['Stand Name'];
            opt.label = s['City'] + ', ' + s['State'];
        } else { // Flight
            opt.value = `${s['City']} – ${s['Airport Name']} (${s['IATA']})`;
            opt.label = s['Country'];
        }
        dl.appendChild(opt);
    });
    // Wire both From and To fields to this datalist
    ['tkt-from','tkt-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute('list', listId); el.placeholder = type === 'Train' ? 'Station name or code' : type === 'Bus' ? 'Bus stand / city' : 'City or airport'; }
    });
}

async function refreshStationList() {
    const type = document.getElementById('tkt-type')?.value || 'Train';
    const fromEl = document.getElementById('tkt-from');
    const toEl   = document.getElementById('tkt-to');
    if (fromEl) fromEl.placeholder = 'Loading stations…';
    const stations = await loadStations(type);
    buildDatalist(stations, type);
}

// Pre-load all three lists in background after page ready
function preloadAllStations() {
    if (!CONFIG.gasUrl) return;
    setTimeout(() => {
        ['Train','Bus','Flight'].forEach(t => loadStations(t));
    }, 2000); // defer 2s so page renders first
}

// ==================== BOOKING TABS ====================
function switchBookingTab(tab) {
    const ridePanel   = document.getElementById('ride-panel');
    const ticketPanel = document.getElementById('ticket-panel');
    const tabRide     = document.getElementById('tab-ride');
    const tabTicket   = document.getElementById('tab-ticket');
    if (!ridePanel || !ticketPanel) return;

    if (tab === 'ticket') {
        ridePanel.style.display   = 'none';
        ticketPanel.style.display = '';
        tabRide.classList.remove('active');
        tabTicket.classList.add('active');
        updateTicketClass(); // ensure DOB fields and class dropdown reflect current type
    } else {
        ticketPanel.style.display = 'none';
        ridePanel.style.display   = '';
        tabTicket.classList.remove('active');
        tabRide.classList.add('active');
    }
}
window.switchBookingTab = switchBookingTab;

// ==================== TICKET CLASS SMART DROPDOWN ====================
const TICKET_CLASSES = {
    Train:  ['Sleeper (SL)', '3rd AC (3A)', '2nd AC (2A)', '1st AC (1A)', 'Chair Car (CC)', 'Executive Chair (EC)'],
    Bus:    ['Seater', 'Semi-Sleeper', 'Sleeper', 'Volvo / AC Seater', 'Volvo / AC Sleeper'],
    Flight: ['Economy', 'Premium Economy', 'Business']
};
const DOB_REQUIRED_TYPES = ['Train', 'Flight'];

function updateTicketClass() {
    const type = document.getElementById('tkt-type')?.value;
    const sel  = document.getElementById('tkt-class');
    if (!sel || !type) return;
    const opts = TICKET_CLASSES[type] || TICKET_CLASSES.Train;
    sel.innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join('');
    // Show/hide DOB fields based on type
    const needsDob = DOB_REQUIRED_TYPES.includes(type);
    const p1Wrap = document.getElementById('tkt-dob-p1-wrap');
    if (p1Wrap) p1Wrap.style.display = needsDob ? '' : 'none';
    updatePaxNames(); // regenerate extra pax fields with/without DOB
    refreshStationList(); // swap datalist for new type
    // Update service charge notice
    const chargeTexts = {
        Train:  'Train: ₹15 (Sleeper/2S) or ₹30 (AC classes) per ticket + 5% GST on service fee (IRCTC norms). Final charges confirmed on WhatsApp before booking.',
        Bus:    'Bus: ₹30–₹50 booking service fee per transaction. Final charges confirmed on WhatsApp before booking.',
        Flight: 'Flight: ₹200–₹500 per booking (varies by airline & fare class) + applicable taxes. Final charges confirmed on WhatsApp before booking.'
    };
    const chargeEl = document.getElementById('tkt-charge-text');
    if (chargeEl) chargeEl.textContent = chargeTexts[type] || chargeTexts.Train;
}
window.updateTicketClass = updateTicketClass;

// ==================== DYNAMIC PASSENGER NAMES ====================
function updatePaxNames() {
    const pax       = parseInt(document.getElementById('tkt-pax')?.value || 1, 10);
    const type      = document.getElementById('tkt-type')?.value || 'Train';
    const needsDob  = DOB_REQUIRED_TYPES.includes(type);
    const container = document.getElementById('tkt-extra-pax');
    if (!container) return;
    container.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    for (let i = 2; i <= pax; i++) {
        const dobField = needsDob
            ? `<div class="form-group" style="margin-top:6px;">
                <label style="font-weight:500;font-size:0.88rem;"><i class="fas fa-birthday-cake"></i> Passenger ${i} Date of Birth *</label>
                <input type="date" id="tkt-dob-${i}" max="${today}">
               </div>`
            : '';
        const div = document.createElement('div');
        div.style.borderTop = '1px dashed rgba(201,162,39,0.3)';
        div.style.paddingTop = '10px';
        div.style.marginTop = '10px';
        div.innerHTML = `<div class="form-group">
            <label><i class="fas fa-user"></i> Passenger ${i} Name</label>
            <input type="text" id="tkt-pax-name-${i}" placeholder="Full name of passenger ${i}">
           </div>${dobField}`;
        container.appendChild(div);
    }
    // Also set max date on P1 DOB if visible
    const dob1 = document.getElementById('tkt-dob-1');
    if (dob1 && !dob1.max) dob1.max = today;
}
window.updatePaxNames = updatePaxNames;

// ==================== TICKET BOOKING ENQUIRY (WhatsApp direct) ====================
function sendTicketEnquiry() {
    const type  = document.getElementById('tkt-type')?.value;
    const name  = document.getElementById('tkt-name')?.value.trim();
    const phone = document.getElementById('tkt-phone')?.value.trim();
    const from  = document.getElementById('tkt-from')?.value.trim();
    const to    = document.getElementById('tkt-to')?.value.trim();
    const date  = document.getElementById('tkt-date')?.value;
    const pax   = parseInt(document.getElementById('tkt-pax')?.value || 1, 10);
    const cls   = document.getElementById('tkt-class')?.value;
    const notes = document.getElementById('tkt-notes')?.value.trim();

    if (!name || !phone || !from || !to || !date) {
        showToast('Please fill Name, Phone, From, To and Travel Date.', 'error');
        return;
    }
    if (!/^\d{10}$/.test(phone)) { showToast('Enter a valid 10-digit phone number.', 'error'); return; }

    const needsDob = DOB_REQUIRED_TYPES.includes(type);

    // Validate P1 DOB if required
    if (needsDob) {
        const dob1 = document.getElementById('tkt-dob-1')?.value;
        if (!dob1) { showToast('Date of Birth is required for each passenger (Train/Flight).', 'error'); return; }
    }

    // Collect all passenger names + DOBs
    const passengers = [{ name, dob: needsDob ? (document.getElementById('tkt-dob-1')?.value || '') : '' }];
    for (let i = 2; i <= pax; i++) {
        const n   = document.getElementById(`tkt-pax-name-${i}`)?.value.trim() || '';
        const dob = needsDob ? (document.getElementById(`tkt-dob-${i}`)?.value || '') : '';
        if (needsDob && !dob && n) { showToast(`Date of Birth missing for Passenger ${i}.`, 'error'); return; }
        passengers.push({ name: n, dob });
    }
    const paxNames = passengers.map(p => p.name);

    let msg = `*TICKET BOOKING ENQUIRY – Rapid Travels*\n\n`;
    msg += `Ticket Type: ${type} Ticket\n`;
    msg += `From: ${from}  →  To: ${to}\n`;
    msg += `Travel Date: ${formatDateIST(date)}\n`;
    msg += `Class: ${cls || 'Any'}\n`;
    msg += `Passengers: ${pax}\n`;
    passengers.forEach((p, idx) => {
        msg += `  P${idx + 1}: ${p.name || '—'}`;
        if (needsDob && p.dob) msg += ` (DOB: ${formatDateIST(p.dob)})`;
        msg += '\n';
    });
    msg += `Contact Phone: ${phone}\n`;
    if (notes) msg += `Notes: ${notes}\n`;
    msg += `\nPlease confirm availability and charges.`;

    // Log to Google Sheet (fire-and-forget, don't block WhatsApp)
    if (CONFIG.gasUrl) {
        fetch(CONFIG.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'submitTicketEnquiry',
                data: { type: type + ' Ticket', from, to, date, cls, pax, passengers, phone, notes }
            })
        }).catch(() => {}); // silent — WhatsApp is the primary channel
    }

    window.open(`https://wa.me/919480324895?text=${encodeURIComponent(msg)}`, '_blank');
}
window.sendTicketEnquiry = sendTicketEnquiry;

async function handleFormSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;                 // ignore a second tap while a submit is in flight
    if (!validateForm()) return;

    isSubmitting = true;
    const btn = document.getElementById('submitBtn');
    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-text">Submitting…</span>'; }

    // Generate the booking ID once and reuse it. If saving fails and the user retries,
    // the same ID is sent — so any server-side dedupe can recognise the repeat.
    if (!currentBookingId) currentBookingId = generateBookingId();

    try {
        let bookingData = collectFormData();
        showToast('Checking vehicle availability...', 'success');
        let avail = await checkVehicleAvailability(bookingData.journeyDate, bookingData.pickupTime);
        if (!avail.available) { showNoVehiclesModal(avail.message); return; }
        showToast('Saving your booking...', 'success');
        let saved = await saveBookingToSheet(bookingData);
        if (!saved.success) { showToast('Failed to save booking. Please try again.', 'error'); return; }
        window.currentBookingData = bookingData;
        saveToLocalStorage(bookingData.fullName, bookingData.phone);
        showPostSubmitModal(bookingData);
        currentBookingId = null;              // booking succeeded; next booking gets a fresh ID
    } finally {
        isSubmitting = false;
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
}

function showNoVehiclesModal(msg) {
    let modal = document.getElementById('noVehiclesModal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'noVehiclesModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
    modal.innerHTML = `<div class="modal"><div class="modal-header" style="background:#e74c3c;"><h3><i class="fas fa-car"></i> 🚗 Car Fully Booked</h3><button class="modal-close" onclick="closeNoVehiclesModal()">&times;</button></div><div class="modal-body" style="text-align:center;"><i class="fas fa-clock" style="font-size:60px; color:#e74c3c; margin-bottom:20px;"></i><p style="font-size:18px; margin-bottom:15px;">${msg}</p><div style="background:#fff3cd; padding:15px; border-radius:8px; margin:20px 0;"><strong>💡 Suggestions:</strong><br>• Try a different time slot<br>• Choose another date<br>• Call us directly at <strong>94803 24895</strong></div><button onclick="closeNoVehiclesModal()" class="submit-btn" style="background:#0d2145;">Choose Different Time</button></div></div>`;
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeNoVehiclesModal() {
    let modal = document.getElementById('noVehiclesModal');
    if (modal) modal.classList.remove('active');
}

// ==================== POST-SUBMIT MODAL (with IST dates) ====================
function showPostSubmitModal(data) {
    let modal = document.getElementById('postSubmitModal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'postSubmitModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
    const formattedJourney = formatDateTimeIST(data.journeyDate, data.pickupTime);
    modal.innerHTML = `<div class="modal"><div class="modal-header" style="background:#27ae60;"><h3><i class="fas fa-check-circle"></i> Booking Submitted Successfully!</h3><button class="modal-close" onclick="closePostSubmitModal()">&times;</button></div><div class="modal-body" style="text-align:center;"><i class="fas fa-save" style="font-size:48px; color:#27ae60; margin-bottom:15px;"></i><p>Booking ID: <strong id="modalBookingId" style="cursor:pointer;color:#0d2145;" title="Click to copy">${data.bookingId}</strong> <button onclick="copyBookingId('${data.bookingId}')" style="background:none;border:1px solid #ccc;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:0.75rem;margin-left:6px;"><i class="fas fa-copy"></i> Copy</button></p><p>Journey: ${formattedJourney}</p><p style="margin-top:10px;">Would you like to send the details via WhatsApp to complete the request?</p><div class="modal-actions" style="justify-content:center; margin-top:20px;"><button class="btn-cancel" onclick="closePostSubmitModal()">Close</button><button class="btn-whatsapp" onclick="sendWhatsAppFromModal()"><i class="fab fa-whatsapp"></i> Send via WhatsApp</button></div></div></div>`;
    setTimeout(() => modal.classList.add('active'), 10);
}

function closePostSubmitModal() {
    let modal = document.getElementById('postSubmitModal');
    if (modal) modal.classList.remove('active');
}

// ==================== WHATSAPP MESSAGE (clean IST format, no �) ====================
function createWhatsAppMessage(data) {
    const formattedJourney = formatDateTimeIST(data.journeyDate, data.pickupTime);
    let msg = `*NEW BOOKING REQUEST - ${data.bookingId}*\n\n`;
    msg += `Customer: ${data.fullName}\nPhone: ${data.phone}\nEmail: ${data.email}\n\n`;
    msg += `Trip: ${data.tripType === 'oneway' ? 'One Way' : (data.tripType === 'roundtrip' ? 'Round Trip' : 'Multi-Stop')}\n`;
    msg += `Service: ${data.serviceType}\nPickup: ${data.pickup}\n`;
    if (data.stops && data.stops.length) {
        msg += `Stops:\n`;
        data.stops.forEach((s, idx) => { msg += `  ${idx+1}. ${s.location} (halt ${s.halt} min)\n`; });
    }
    msg += `Drop: ${data.drop}\n`;
    if (data.tripType === 'roundtrip') {
        const returnDateTime = formatDateTimeIST(data.returnDate, data.returnTime);
        msg += `Return: ${returnDateTime}\nReturn Drop: ${data.returnDrop || 'Same as pickup'}\n`;
    }
    if (data.landmark) msg += `Landmark: ${data.landmark}\n`;
    msg += `Journey: ${formattedJourney}\nPassengers: ${data.passengers}\nLuggage: ${data.luggage}\n\n`;
    msg += `Service Highlights: Online ticket booking, Professional driver, Clean Tata Indica\n\n`;
    msg += `To confirm, please reply with "OK".`;
    return msg;
}

async function sendWhatsAppFromModal() {
    let data = window.currentBookingData;
    if (!data) return;
    let msg = createWhatsAppMessage(data);
    let url = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
    closePostSubmitModal();
    showToast('Redirecting to WhatsApp...', 'success');
    setTimeout(() => window.open(url, '_blank'), 500);
    if (document.getElementById('emailCopy').checked) sendEmailCopy(data);
}

async function sendEmailCopy(data) {
    try {
        await fetch(`${GAS_URL}?action=sendEmailCopy`, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        showToast('Confirmation email sent!', 'success');
    } catch (e) { console.log(e); }
}

// ==================== UI HELPERS ====================
function showToast(msg, type = 'success') {
    let toast = document.getElementById('toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function copyBookingId(id) {
    navigator.clipboard.writeText(id).then(() => showToast('Booking ID copied!', 'success')).catch(() => showToast(id, 'success'));
}

// Global functions for modal buttons
window.closeNoVehiclesModal = closeNoVehiclesModal;
window.closePostSubmitModal = closePostSubmitModal;
window.sendWhatsAppFromModal = sendWhatsAppFromModal;
window.copyBookingId = copyBookingId;