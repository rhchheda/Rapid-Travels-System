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
    setupMultiStop();
    setupFormSubmit();
    removeLoadingOverlay();
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
    if (inp) inp.min = new Date().toISOString().split('T')[0];
}

function isPastDateTime(dateStr, timeStr) {
    let sel = new Date(`${dateStr}T${timeStr}:00`);
    let now = new Date();
    let minAllowed = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour buffer
    return sel < minAllowed;
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
    modal.innerHTML = `<div class="modal"><div class="modal-header" style="background:#27ae60;"><h3><i class="fas fa-check-circle"></i> Booking Submitted Successfully!</h3><button class="modal-close" onclick="closePostSubmitModal()">&times;</button></div><div class="modal-body" style="text-align:center;"><i class="fas fa-save" style="font-size:48px; color:#27ae60; margin-bottom:15px;"></i><p>Your booking has been saved. Booking ID: <strong>${data.bookingId}</strong></p><p>Journey: ${formattedJourney}</p><p>Would you like to send the details via WhatsApp to complete the request?</p><div class="modal-actions" style="justify-content:center; margin-top:20px;"><button class="btn-cancel" onclick="closePostSubmitModal()">Close</button><button class="btn-whatsapp" onclick="sendWhatsAppFromModal()"><i class="fab fa-whatsapp"></i> Send via WhatsApp</button></div></div></div>`;
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

// Global functions for modal buttons
window.closeNoVehiclesModal = closeNoVehiclesModal;
window.closePostSubmitModal = closePostSubmitModal;
window.sendWhatsAppFromModal = sendWhatsAppFromModal;