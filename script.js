let map;
let googleMapsPolyline = null;

// =============================================
// API KEYS
// =============================================
// Gemini Keys are now secured in the Python Backend (app.py)

window.taxiBotCore = {
    redrawCurrentRoute: null
};

// --- Map Initialization (Google Maps with dark Stitch theme) ---
async function initMap() {
    try {
        const { Map } = await google.maps.importLibrary("maps");

        // Dark map style matching the Stitch design
        const darkStyle = [
            { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#a0a4b8" }] },
            { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#5a5a7a" }] },
            { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#162020" }] },
            { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#3d6b35" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c54" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212145" }] },
            { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8989ba" }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3d3d70" }] },
            { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f1f4b" }] },
            { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#a0a4c0" }] },
            { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3058" }] },
            { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1b3e" }] },
            { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
            { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
            { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4a4a8a" }, { weight: 1 }] },
            { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#3a3a6a" }, { weight: 0.5 }] },
        ];

        map = new Map(document.getElementById("map"), {
            center: { lat: 20.5937, lng: 78.9629 },
            zoom: 5,
            disableDefaultUI: true,
            zoomControl: false,
            styles: darkStyle,
        });

        if (typeof window.taxiBotCore.redrawCurrentRoute === 'function') {
            window.taxiBotCore.redrawCurrentRoute();
        }

    } catch (e) {
        console.error("Google Maps initialization failed.", e);
    }
}
window.initMap = initMap;
document.addEventListener('DOMContentLoaded', () => {
    initMap();

    // Wire custom map controls once map is ready
    const zoomIn  = document.getElementById('map-zoom-in');
    const zoomOut = document.getElementById('map-zoom-out');
    const compass = document.getElementById('map-compass');
    if (zoomIn)  zoomIn.addEventListener('click',  () => map && map.setZoom(map.getZoom() + 1));
    if (zoomOut) zoomOut.addEventListener('click', () => map && map.setZoom(map.getZoom() - 1));
    if (compass) compass.addEventListener('click', () => {
        if (!navigator.geolocation || !map) return;
        navigator.geolocation.getCurrentPosition(pos => {
            map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            map.setZoom(13);
        }, () => {});
    });
});

document.addEventListener('DOMContentLoaded', () => {
    // ---- User Profile & Logout Logic ----
    const userEmail = localStorage.getItem('taxibot_user') || 'user@example.com';
    let userProfile = null;
    try {
        userProfile = JSON.parse(localStorage.getItem('taxibot_profile'));
    } catch(e) {}

    const userNameElement = document.getElementById('user-display-name');
    const userEmailElement = document.getElementById('user-display-email');
    const userAvatarElement = document.getElementById('user-avatar');
    
    if (userProfile && userProfile.picture) {
        // We have a real Google profile!
        if (userNameElement) userNameElement.textContent = userProfile.name || userProfile.email;
        if (userEmailElement) userEmailElement.textContent = userProfile.email;
        if (userAvatarElement) {
            userAvatarElement.innerHTML = `<img src="${userProfile.picture}" alt="DP" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            userAvatarElement.style.background = 'transparent';
        }
    } else {
        // Fallback for manual email login or old cached users
        const emailPrefix = userEmail.split('@')[0];
        if (userNameElement) userNameElement.textContent = emailPrefix;
        if (userEmailElement) userEmailElement.textContent = userEmail;
        if (userAvatarElement) userAvatarElement.textContent = emailPrefix.charAt(0).toUpperCase();
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('taxibot_user');
            localStorage.removeItem('taxibot_profile');
            window.location.href = 'index.html';
        });
    }
});

// ============================================================
// FREE ROUTING ENGINE — No Google API Key Required!
// Uses Nominatim (OpenStreetMap) + OSRM (Open Source Routing)
// ============================================================

async function geocodeLocation(locationName) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`;
    const response = await fetch(url, {
        headers: { 'Accept-Language': 'en' }
    });
    const data = await response.json();
    if (!data || data.length === 0) throw new Error(`Could not find location: "${locationName}". Please be more specific (e.g. add city name).`);
    return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name
    };
}

async function getOSRMRoute(origin, destination) {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.routes || data.routes.length === 0) throw new Error('OSRM could not find a route between these locations.');
    return data.routes[0];
}

function drawPolylineOnMap(coordinates) {
    if (!map) return;
    if (googleMapsPolyline) googleMapsPolyline.setMap(null);

    const path = coordinates.map(c => ({ lat: c[1], lng: c[0] }));

    googleMapsPolyline = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: "#FF3CAC",
        strokeOpacity: 0.9,
        strokeWeight: 6,
    });
    googleMapsPolyline.setMap(map);

    // Fit map to route bounds
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
}

// --- State Management & Chat Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
// =============================================
// GEMINI AI ENGINE
// =============================================
async function askGemini(userText, session) {
    const stateContext = {
        awaiting_pickup:    'Waiting for user to provide their PICKUP location.',
        awaiting_drop:      `Pickup is "${session.pickup}". Waiting for DROP/DESTINATION location.`,
        awaiting_cab_type:  `Route set: ${session.pickup} → ${session.drop}. Waiting for cab type choice.`,
        awaiting_passengers:`Cab type selected: ${session.cabType}. Waiting for passenger count.`,
        ready:              'Fare estimate already shown. User is in post-result chat.',
    };

    const historyLines = session.messages.slice(-10, -1).map(m => `${m.sender === 'ai' ? 'TaxiBot' : 'User'}: ${m.text}`);
    const historyBlock = historyLines.length > 0 ? `\n\nRECENT CHAT HISTORY:\n${historyLines.join('\n')}` : '';

    const systemPrompt = `You are TaxiBot 🚕, an advanced AI-powered taxi fare estimator for India. You intelligently help users compare Uber, Ola & Rapido cab fares.

STRICT RULES (NEVER break these):
1. You ONLY discuss topics related to: taxi, cab, auto-rickshaw, bike taxi, rides, routes, locations, travel, fare, surge pricing, transportation in India.
2. If ANY message is off-topic (coding help, recipes, general knowledge, sports, politics, math, etc.) — respond with intent "off_topic" and a polite decline.
3. You support English, Hindi, and Hinglish naturally. Be highly conversational, witty, and contextual.
4. ALWAYS respond with ONLY valid JSON — no markdown fences around JSON, no explanation outside the JSON.
5. Provide helpful, conversational responses using emojis and **bold markdown** within the message field. Don't be robotic.

CURRENT CONVERSATION STATE: \${stateContext[session.state] || 'General chat.'}\${historyBlock}

Analyze the user message and respond with ONLY this JSON object:
{
  "intent": "<intent_type>",
  "message": "<your conversational response>",
  "pickup": "<extracted pickup location or null>",
  "drop": "<extracted destination location or null>"
}

Intent Contexts & Rules:
- "greeting": Respond warmly to hello/hi/namaste.
- "route_both": Extract both locations if the user provides pickup and drop in one message (e.g. "I want to go from X to Y").
- "location_only": Extract the location if the user provides a single location. Do not hallucinate the other location.
- "help": Guide the user concisely on how to use TaxiBot.
- "chitchat": Engage in natural conversation regarding cabs, surge pricing, travel, etc. Make it fun and helpful.
- "off_topic": Firmly but politely steer the conversation back to taxis and travel.
- "acknowledge": Acknowledge commands (e.g. "ok", "proceed", "yes").

CRITICAL:
- ONLY populate 'pickup' and 'drop' if you are highly confident the user is providing a location intended for a ride.
- If intent is "route_both", both pickup and drop MUST be populated.
- If intent is "location_only", ONLY populate pickup. Drop must be null.
- For all other intents, both pickup and drop must be null.
- In your "message", ALWAYS confirm the details extracted so the user feels understood.`;

    try {
        // Use relative path for Vercel, fallback to localhost Flask for local dev
        const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
        const url = isLocal ? 'http://127.0.0.1:5000/api/chat' : '/api/chat';
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemPrompt: systemPrompt,
                userText: userText
            })
        });

        if (!resp.ok) {
            console.warn(`Backend API error: HTTP ${resp.status}`);
            throw new Error(`Backend failed to respond.`);
        }
        
        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        // Strip any accidental markdown code fences
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            intent:  parsed.intent  || 'chitchat',
            message: parsed.message || null,
            pickup:  parsed.pickup  || null,
            drop:    parsed.drop    || null,
            fromGemini: true
        };
    } catch (err) {
        console.warn('Gemini failed, using rule-based fallback:', err.message);
        // Fallback: classifies intent locally
        const fi = detectIntent(userText);
        return {
            intent:  fi === 'location' ? 'location_only' : fi,
            message: null,
            pickup:  fi === 'location' ? userText : null,
            drop:    null,
            fromGemini: false
        };
    }
}

// Helper: normalise location strings for comparison
function normLoc(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim(); }

    const chatContainer = document.getElementById('chat-container');
    const sendButton = document.getElementById('send-button');
    const historyList = document.getElementById('history-list');
    const newChatBtn = document.getElementById('new-chat-btn');
    const newRequestBtn = document.getElementById('new-request-btn');
    let markers = []; // declared here so clearMarkers() works on first startNewChat()
    const menuBtn = document.getElementById('menu-btn');
    const sidebarPanel = document.getElementById('history-drawer');  // updated ID
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const autocompleteList = document.getElementById('autocomplete-list');

    // ---- Sidebar Drawer Toggle ----
    function openSidebar() {
        sidebarPanel.classList.add('open');
        sidebarBackdrop.classList.add('active');
    }
    function closeSidebar() {
        sidebarPanel.classList.remove('open');
        sidebarBackdrop.classList.remove('active');
    }
    if (menuBtn)          menuBtn.addEventListener('click', openSidebar);
    if (closeSidebarBtn)  closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarBackdrop)  sidebarBackdrop.addEventListener('click', closeSidebar);

    // ---- Left Nav: History item opens drawer ----
    const navHistoryBtn = document.getElementById('nav-history');
    if (navHistoryBtn) navHistoryBtn.addEventListener('click', openSidebar);

    // ---- Left Nav: About item opens About Modal ----
    const navInfoBtn = document.getElementById('nav-info');
    const aboutModal = document.getElementById('about-modal');
    const closeAboutBtn = document.getElementById('close-about-btn');

    if (navInfoBtn) navInfoBtn.addEventListener('click', () => {
        if (aboutModal) aboutModal.classList.remove('hidden');
        setNavActive('nav-info');
        if (window.innerWidth <= 900) closeSidebar();
    });
    if (closeAboutBtn) closeAboutBtn.addEventListener('click', () => {
        if (aboutModal) aboutModal.classList.add('hidden');
        setNavActive('nav-concierge');
    });

    // ---- Confirm Ride Button ----
    const estConfirmBtn = document.getElementById('est-confirm-btn');
    if (estConfirmBtn) {
        estConfirmBtn.addEventListener('click', () => {
            appendMessage("Confirm Ride Now", 'user', true);
            appendMessage("✅ **Ride Confirmed!** Your driver is on their way.\n\nYou will receive a notification with driver details shortly.", 'ai', true);
            hideLiveEstimateCard();
            if (currentSession) {
                currentSession.state = 'ready';
                saveSession();
            }
        });
    }

    // ---- Left Nav: New Request = new chat ----
    if (newRequestBtn) newRequestBtn.addEventListener('click', startNewChat);

    // ---- Nav active state ----
    function setNavActive(id) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(id);
        if (target) target.classList.add('active');
    }

    // ---- Autocomplete (Nominatim) ----
    let autocompleteTimer = null;
    const LOCATION_STATES = ['awaiting_pickup', 'awaiting_drop'];

    function isLocationState() {
        return currentSession && LOCATION_STATES.includes(currentSession.state);
    }

    function hideAutocomplete() {
        autocompleteList.classList.add('hidden');
        autocompleteList.innerHTML = '';
    }

    async function fetchSuggestions(query) {
        if (!query || query.length < 3) { hideAutocomplete(); return; }
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
            const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
            const data = await resp.json();
            renderAutocomplete(data);
        } catch(e) {
            hideAutocomplete();
        }
    }

    function renderAutocomplete(results) {
        autocompleteList.innerHTML = '';
        if (!results || results.length === 0) { hideAutocomplete(); return; }

        results.forEach(r => {
            const parts = r.display_name.split(',');
            const mainText = parts.slice(0, 2).join(',').trim();
            const subText  = parts.slice(2, 5).join(',').trim();

            const icon = r.type === 'bus_stop' ? '🚌'
                       : r.type === 'station' || r.class === 'railway' ? '🚉'
                       : r.class === 'highway' ? '🛣️'
                       : r.class === 'aeroway' ? '✈️'
                       : '📍';

            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.innerHTML = `
                <div class="autocomplete-icon">${icon}</div>
                <div class="autocomplete-text">
                    <div class="autocomplete-main">${escapeHTML(mainText)}</div>
                    <div class="autocomplete-sub">${escapeHTML(subText)}</div>
                </div>`;

            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // prevent blur from hiding list before click registers
                messageInput.value = mainText;
                hideAutocomplete();
                messageInput.focus();
            });
            autocompleteList.appendChild(item);
        });
        autocompleteList.classList.remove('hidden');
    }

    messageInput.addEventListener('input', () => {
        if (!isLocationState()) { hideAutocomplete(); return; }
        clearTimeout(autocompleteTimer);
        const val = messageInput.value.trim();
        if (val.length < 3) { hideAutocomplete(); return; }
        autocompleteTimer = setTimeout(() => fetchSuggestions(val), 350);
    });

    messageInput.addEventListener('blur', () => {
        // Small delay so mousedown on item fires first
        setTimeout(hideAutocomplete, 150);
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideAutocomplete();
    });

    // ---- Locate Me (GPS → Reverse Geocode) ----
    const locateBtn = document.getElementById('locate-btn');

    function updateLocateBtnVisibility() {
        if (!locateBtn) return;
        if (currentSession && currentSession.state === 'awaiting_pickup') {
            locateBtn.classList.remove('hidden-btn');
            locateBtn.title = 'Use my current location as pickup';
        } else {
            locateBtn.classList.add('hidden-btn');
        }
    }

    if (locateBtn) {
        locateBtn.addEventListener('click', async () => {
            if (!currentSession || currentSession.state !== 'awaiting_pickup') {
                return; // only works when asking for pickup
            }

            if (!navigator.geolocation) {
                appendMessage('⚠️ Your browser does not support location access.', 'ai', false);
                return;
            }

            locateBtn.classList.add('loading');
            locateBtn.disabled = true;

            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const { latitude, longitude } = pos.coords;
                    try {
                        // Reverse geocode using Nominatim
                        const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
                        const resp = await fetch(url, {
                            headers: { 'Accept-Language': 'en' }
                        });
                        const data = await resp.json();

                        const address = data.display_name
                            ? data.display_name.split(',').slice(0, 3).join(',').trim()
                            : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

                        locateBtn.classList.remove('loading');
                        locateBtn.disabled = false;

                        // Fill input and auto-submit as pickup
                        messageInput.value = address;
                        hideAutocomplete();
                        chatForm.dispatchEvent(new Event('submit'));

                    } catch (err) {
                        locateBtn.classList.remove('loading');
                        locateBtn.disabled = false;
                        appendMessage('❌ Could not reverse-geocode your location. Please type it manually.', 'ai', false);
                    }
                },
                (err) => {
                    locateBtn.classList.remove('loading');
                    locateBtn.disabled = false;
                    const msg = err.code === 1
                        ? '🚫 Location permission was denied. Please allow location access in your browser.'
                        : '❌ Could not get your location. Please try again or type it manually.';
                    appendMessage(msg, 'ai', false);
                },
                { timeout: 10000, maximumAge: 60000 }
            );
        });
    }

    let chatHistoryDB;
    try {
        chatHistoryDB = JSON.parse(localStorage.getItem('taxiBotHistory') || '[]');
        if (!Array.isArray(chatHistoryDB)) chatHistoryDB = [];
    } catch(e) {
        chatHistoryDB = [];
    }

    let currentSession = null;

    window.taxiBotCore.redrawCurrentRoute = async () => {
        if (currentSession && currentSession.state === 'ready' && currentSession.routeCoords) {
            drawPolylineOnMap(currentSession.routeCoords);
        }
    };

    function startNewChat() {
        if(chatContainer) chatContainer.innerHTML = '';
        clearMarkers(); // Bug fix: clear old map markers before new chat
        if (googleMapsPolyline) { googleMapsPolyline.setMap(null); googleMapsPolyline = null; }
        if (map) map.setCenter({ lat: 20.5937, lng: 78.9629 });
        if (map) map.setZoom(5);

        currentSession = {
            id: Date.now(),
            title: "New Estimate",
            state: 'awaiting_pickup',
            pickup: null,
            drop: null,
            cabType: null,
            passengers: null,
            routeCoords: null,
            messages: []
        };

        appendMessage("Hello! I'm **TaxiBot** 🚕. I'll help you estimate your fare.\n\n**Where is your pickup location?**", 'ai', true);
        saveSession();
        renderHistorySidebar();
        updateLocateBtnVisibility();
    }

    function saveSession() {
        if (!currentSession) return;
        const existingIndex = chatHistoryDB.findIndex(s => s.id === currentSession.id);
        if (existingIndex >= 0) {
            chatHistoryDB[existingIndex] = currentSession;
        } else {
            chatHistoryDB.unshift(currentSession);
        }
        try {
            localStorage.setItem('taxiBotHistory', JSON.stringify(chatHistoryDB));
        } catch(e) {
            console.error("LocalStorage error", e);
        }
    }
    function renderHistorySidebar() {
        if(!historyList) return;
        historyList.innerHTML = '';
        chatHistoryDB.forEach(session => {
            if(!session || !session.id) return;
            const div = document.createElement('div');
            div.className = 'history-item';
            if (currentSession && session.id === currentSession.id) div.classList.add('active');

            const titleDiv = document.createElement('div');
            titleDiv.className = 'history-item-title';
            titleDiv.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <span>${escapeHTML(session.title || 'Unknown Route')}</span>
            `;

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.title = 'Delete Chat';
            delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                chatHistoryDB = chatHistoryDB.filter(s => s.id !== session.id);
                try { localStorage.setItem('taxiBotHistory', JSON.stringify(chatHistoryDB)); } catch(err){}
                if(currentSession && currentSession.id === session.id) {
                    startNewChat();
                } else {
                    renderHistorySidebar();
                }
            });

            div.addEventListener('click', () => loadSession(session.id));
            div.appendChild(titleDiv);
            div.appendChild(delBtn);
            historyList.appendChild(div);
        });
    }

    function loadSession(id) {
        const session = chatHistoryDB.find(s => s.id === id);
        if(!session) return;
        currentSession = session;
        if(chatContainer) chatContainer.innerHTML = '';
        closeSidebar();

        if (Array.isArray(session.messages)) {
            session.messages.forEach(msg => {
                if(msg) renderMessageToDOM(msg.text || '', msg.sender || 'ai', msg.timestamp || '');
            });
        }

        renderHistorySidebar();
        window.taxiBotCore.redrawCurrentRoute();
        updateLocateBtnVisibility();
    }

    if(newChatBtn) newChatBtn.addEventListener('click', startNewChat);

    if (chatHistoryDB.length > 0) {
        loadSession(chatHistoryDB[0].id);
    } else {
        startNewChat();
    }

    if(chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAutocomplete();

            const text = messageInput.value.trim();
            if (!text) return;

            appendMessage(text, 'user', true);
            messageInput.value = '';
            messageInput.disabled = true;
            sendButton.disabled = true;

            let typingId = null;
            try {
                typingId = showTypingIndicator();
                await new Promise(resolve => setTimeout(resolve, 600));

                const tEl = document.getElementById(typingId);
                if(tEl) tEl.remove();

                if (!currentSession) startNewChat();

                // ========================================================
                // GEMINI AI — handles awaiting_pickup, awaiting_drop, ready
                // Rule-based handles awaiting_cab_type & awaiting_passengers
                //    (quick-reply structured states — reliable exact match)
                // ========================================================

                if (currentSession.state === 'awaiting_cab_type') {
                    const cabTypes = ['bike', 'auto', 'mini', 'sedan', 'suv', 'premium'];
                    const t2 = text.toLowerCase().trim();
                    const matched = cabTypes.find(c => t2 === c || t2.startsWith(c + ' ') || t2.endsWith(' ' + c));
                    currentSession.cabType = matched
                        ? matched.charAt(0).toUpperCase() + matched.slice(1)
                        : text.trim();
                    currentSession.state = 'awaiting_passengers';
                    appendMessage(pick([
                        `**${currentSession.cabType}** — excellent choice! 🙌\n\nHow many **passengers** will be travelling?`,
                        `Nice! Going with **${currentSession.cabType}** 🚗\n\nHow many people are riding?`,
                    ]), 'ai', true);
                    showQuickReplies([
                        { label: '1', value: '1' }, { label: '2', value: '2' },
                        { label: '3', value: '3' }, { label: '4', value: '4' },
                        { label: '5', value: '5' }, { label: '6', value: '6' },
                    ]);

                } else if (currentSession.state === 'awaiting_passengers') {
                    const num = parseInt(text);
                    currentSession.passengers = isNaN(num) ? 1 : Math.min(Math.max(num, 1), 6);
                    currentSession.state = 'ready';
                    saveSession();
                    await executeMappingAndComparison();

                } else {
                    // ———— ASK GEMINI ————
                    const g = await askGemini(text, currentSession);

                    if (g.intent === 'off_topic') {
                        // Gemini declined the question — show its message
                        appendMessage(g.message || `🚕 I’m TaxiBot — I only help with cab fares and routes!\n\nAsk me anything about **Uber, Ola or Rapido** fares. 😊`, 'ai', true);

                    } else if (g.intent === 'route_both' && g.pickup && g.drop) {
                        // User typed full route in one shot
                        const pn = normLoc(g.pickup), dn = normLoc(g.drop);
                        if (pn === dn || pn.includes(dn) || dn.includes(pn)) {
                            appendMessage(`🤔 Your pickup and destination look like the **same place**!\n\nPlease give two **different** locations.`, 'ai', true);
                        } else {
                            currentSession.pickup = g.pickup;
                            currentSession.drop   = g.drop;
                            currentSession.state  = 'awaiting_cab_type';
                            currentSession.title  = g.pickup + ' → ' + g.drop;
                            appendMessage(
                                g.message || `Got it! 🎯\n\n📍 **Pickup:** ${g.pickup}\n🏁 **Drop:** ${g.drop}\n\nNow, **what type of cab do you need?**`,
                                'ai', true
                            );
                            showQuickReplies([
                                { label: '🏍️ Bike', value: 'Bike' }, { label: '🛺 Auto', value: 'Auto' },
                                { label: '🚕 Mini', value: 'Mini' }, { label: '🚗 Sedan', value: 'Sedan' },
                                { label: '🚙 SUV',  value: 'SUV'  }, { label: '⭐ Premium', value: 'Premium' },
                            ]);
                        }

                    } else if (currentSession.state === 'awaiting_pickup') {
                        if (g.intent === 'location_only' && g.pickup) {
                            currentSession.pickup = g.pickup;
                            currentSession.state  = 'awaiting_drop';
                            currentSession.title  = g.pickup + ' → ?';
                            appendMessage(
                                g.message || `Got it! Starting from **${g.pickup}** 📍\n\nNow, where are you **heading to?** 🏁`,
                                'ai', true
                            );
                        } else {
                            // Greeting, help, chitchat — Gemini's message says it all
                            appendMessage(
                                g.message || `Hey! 🚕 I’m TaxiBot. Tell me your **pickup location** to get started!`,
                                'ai', true
                            );
                        }

                    } else if (currentSession.state === 'awaiting_drop') {
                        // Gemini puts single extracted location in g.pickup
                        const extracted = g.pickup || (g.intent === 'location_only' ? text : null);
                        if (extracted) {
                            const pn = normLoc(currentSession.pickup);
                            const dn = normLoc(extracted);
                            if (pn === dn || (pn.length > 5 && dn.includes(pn)) || (dn.length > 5 && pn.includes(dn))) {
                                appendMessage(pick([
                                    `😄 That’s the same as your pickup!\n\nPlease enter a **different destination**. 🔄`,
                                    `🤔 **"${extracted}"** looks like your pickup location!\n\nWhere do you actually want to **go?**`,
                                ]), 'ai', true);
                            } else {
                                currentSession.drop  = extracted;
                                currentSession.state = 'awaiting_cab_type';
                                currentSession.title = currentSession.pickup + ' → ' + extracted;
                                appendMessage(
                                    g.message || `Perfect! Heading to **${extracted}** 🏁\n\nNow, **what type of cab do you need?**`,
                                    'ai', true
                                );
                                showQuickReplies([
                                    { label: '🏍️ Bike', value: 'Bike' }, { label: '🛺 Auto', value: 'Auto' },
                                    { label: '🚕 Mini', value: 'Mini' }, { label: '🚗 Sedan', value: 'Sedan' },
                                    { label: '🚙 SUV',  value: 'SUV'  }, { label: '⭐ Premium', value: 'Premium' },
                                ]);
                            }
                        } else {
                            // Not a location — Gemini handles it (help, chitchat, etc.)
                            appendMessage(
                                g.message || `Where would you like to be **dropped off?** 🏁`,
                                'ai', true
                            );
                        }

                    } else if (currentSession.state === 'ready') {
                        appendMessage(
                            g.message || `Route’s all set! 🗺️ For a new estimate, tap **☰ menu → New Chat**. 😊`,
                            'ai', true
                        );
                    } else {
                        if (g.message) appendMessage(g.message, 'ai', true);
                    }
                }

                saveSession();
                renderHistorySidebar();
                updateLocateBtnVisibility();

            } catch (err) {
                console.error("Chat flow error:", err);
                const tEl = document.getElementById(typingId);
                if(tEl) tEl.remove();
                appendMessage(`⚠️ Something went wrong: ${err.message || 'Unknown error'}. Please try again.`, 'ai', false);
            }

            messageInput.disabled = false;
            sendButton.disabled = false;
            messageInput.focus();
        });
    }

    // =============================================
    // INTENT DETECTION ENGINE
    // =============================================
    function detectIntent(text) {
        const t = text.toLowerCase().trim();

        // Use ONLY word-boundary matching — prevents address words like
        // "University" matching "ty", "Lovely" matching "lol", etc.
        const match = (patterns) => patterns.some(p => {
            try { return new RegExp(`(^|[\\s,])${p}([\\s,!?.]|$)`, 'i').test(t); }
            catch(e) { return false; }
        });

        if (match(['hi', 'hello', 'hey', 'hii', 'helo', 'howdy', 'namaste', 'namaskar', 'hola', 'heyy', 'heyyy']))
            return 'greeting';

        if (match(['how are you', 'how r u', 'how are u', 'kaisa hai', 'kaise ho', 'how do you do', 'whats up', "what's up", 'wassup']))
            return 'how_are_you';

        // Only match "thanks", "thank you", "thank u" — NOT substrings inside words
        if (match(['thanks', 'thank you', 'thank u', 'thx', 'shukriya', 'dhanyawad', 'great job', 'well done']))
            return 'thanks';

        if (match(['bye', 'goodbye', 'good bye', 'take care', 'see you', 'see ya', 'alvida', 'cya']))
            return 'bye';

        if (match(['who are you', 'what are you', 'what can you do', 'tell me about yourself', 'introduce yourself', 'what is taxibot']))
            return 'who_are_you';

        if (match(['how to use', 'how does this work', 'guide me', 'how do i use', 'kaise kare']))
            return 'help';
        // "help" alone as standalone word
        if (/^help[!?.]?$/.test(t))
            return 'help';

        if (match(['amazing', 'love this', 'fantastic', 'brilliant', 'superb', 'best bot', 'nice bot', 'good bot']))
            return 'compliment';
        // standalone "wow" or "cool" or "great"
        if (/^(wow|cool|great|excellent)[!.]?$/.test(t))
            return 'compliment';

        if (match(['tell me a joke', 'say something funny', 'make me laugh']))
            return 'joke';
        if (/^(lol|haha|joke)[!.]?$/.test(t))
            return 'joke';

        if (match(['surge', 'peak hour', 'rush hour', 'why is it expensive', 'why so costly']))
            return 'surge_question';

        if (match(['cheapest cab', 'which is cheapest', 'best option', 'save money', 'low price', 'affordable', 'sasta']))
            return 'cheapest_question';

        return 'location'; // default: treat as location address input
    }

    // Pick a random item from array
    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // =============================================
    // NATURAL LANGUAGE ROUTE PARSER
    // Detects patterns like "A to B", "from A to B",
    // "A → B", "A - B", "A se B", "A se B tak"
    // Returns { pickup, drop } or null
    // =============================================
    function parseRouteFromText(text) {
        const t = text.trim();

        // Ordered list of split patterns (most specific first)
        const patterns = [
            // English
            /^from\s+(.+?)\s+to\s+(.+)$/i,          // "from A to B"
            /^(.+?)\s+to\s+(.+)$/i,                   // "A to B"
            /^(.+?)\s*→\s*(.+)$/,                     // "A → B"
            /^(.+?)\s*->\s*(.+)$/,                    // "A -> B"
            /^(.+?)\s+towards?\s+(.+)$/i,             // "A toward B"
            /^(.+?)\s+going\s+to\s+(.+)$/i,           // "A going to B"
            /^pickup\s+(.+?)\s+drop\s+(.+)$/i,        // "pickup A drop B"
            /^(.+?)\s+drop\s+(?:me\s+at\s+)?(.+)$/i, // "A drop me at B"
            // Hindi / Hinglish
            /^(.+?)\s+se\s+(.+?)\s+tak$/i,            // "A se B tak"
            /^(.+?)\s+se\s+(.+)$/i,                   // "A se B"
        ];

        for (const pattern of patterns) {
            const match = t.match(pattern);
            if (match) {
                const pickup = match[1].trim();
                const drop   = match[2].trim();
                // Both parts must be at least 3 chars to avoid false positives
                if (pickup.length >= 3 && drop.length >= 3) {
                    return { pickup, drop };
                }
            }
        }
        return null; // Not a route pattern
    }

    // Core: Free Routing + Pricing
    async function executeMappingAndComparison() {
        appendMessage(`🗺️ Looking up **${currentSession.pickup}** and **${currentSession.drop}**...`, 'ai', true);
        const lookupTypingId = showTypingIndicator();

        try {
            // Step 1: Geocode both locations using free Nominatim
            const [originGeo, destGeo] = await Promise.all([
                geocodeLocation(currentSession.pickup),
                geocodeLocation(currentSession.drop)
            ]);

            // Step 2: Get route from free OSRM
            const route = await getOSRMRoute(originGeo, destGeo);

            // Remove typing indicator
            const tEl = document.getElementById(lookupTypingId);
            if(tEl) tEl.remove();

            const distanceKm = (route.distance / 1000).toFixed(1);
            const distanceMiles = (route.distance / 1609.34).toFixed(1);
            const durationMins = Math.round(route.duration / 60);

            // Save route coordinates for re-drawing
            currentSession.routeCoords = route.geometry.coordinates;
            currentSession.originGeo = originGeo;
            currentSession.destGeo = destGeo;

            // Draw on map
            if (map) drawPolylineOnMap(route.geometry.coordinates);

            // Add markers
            addMarker(originGeo, '📍 Pickup');
            addMarker(destGeo, '🏁 Drop');

            // Generate comparison card
            const compHTML = generateComparisonCard(
                parseFloat(distanceMiles), durationMins, distanceKm,
                currentSession.cabType || 'Mini',
                currentSession.passengers || 1
            );

            // ── Show Live Estimate Card on map ──────────────────
            showLiveEstimateCard(
                originGeo.displayName.split(',').slice(0, 2).join(',').trim(),
                destGeo.displayName.split(',').slice(0, 2).join(',').trim(),
                distanceKm, durationMins,
                currentSession.cabType || 'Mini',
                currentSession.passengers || 1
            );
            appendMessage(
                `✅ Route found!\n\n📍 **From:** ${originGeo.displayName.split(',').slice(0, 3).join(',')}\n🏁 **To:** ${destGeo.displayName.split(',').slice(0, 3).join(',')}\n\n📏 **Distance:** ${distanceKm} km\n⏱️ **Est. Drive Time:** ${durationMins} min\n👥 **Passengers:** ${currentSession.passengers || 1} | 🚗 **Cab:** ${currentSession.cabType || 'Mini'}\n\n${compHTML}`,
                'ai', true
            );

        } catch (error) {
            const tEl = document.getElementById(lookupTypingId);
            if(tEl) tEl.remove();
            console.error('Routing Error:', error);
            clearMarkers(); // Bug fix: clear any partial markers on failure
            // Bug fix: reset to the correct failed step, not always awaiting_drop
            if (!currentSession.originGeo) {
                currentSession.state = 'awaiting_pickup'; // pickup geocode failed
            } else {
                currentSession.state = 'awaiting_drop';   // drop geocode or routing failed
            }
            appendMessage(`❌ **Could not find route:** ${error.message}\n\nPlease try providing more specific addresses (e.g., include city or state name).`, 'ai', true);
            updateLocateBtnVisibility();
        }
    }


    function clearMarkers() {
        markers.forEach(m => { try { m.setMap(null); } catch(e){} });
        markers = [];
    }

    function showLiveEstimateCard(pickupName, dropName, distanceKm, durationMins, cabType, passengers) {
        const card = document.getElementById('live-estimate-card');
        if (!card) return;

        // Re-use fare calculation logic (simplified for cheapest)
        const km = parseFloat(distanceKm);
        const mins = parseInt(durationMins);
        const cab = (cabType || 'Mini').toLowerCase();
        const cabMultipliers = {
            bike: { uber: 0, ola: 0, rapido: 1.0 },
            auto: { uber: 0, ola: 0.8, rapido: 0 },
            mini: { uber: 0.9, ola: 0.85, rapido: 0 },
            sedan: { uber: 1.0, ola: 1.0, rapido: 0 },
            suv: { uber: 1.35, ola: 1.3, rapido: 0 },
            premium: { uber: 1.6, ola: 1.5, rapido: 0 },
        };
        const mult = cabMultipliers[cab] || cabMultipliers['mini'];
        const baseFare = (base, perKm, perMin, m) =>
            m === 0 ? null : Math.round((base + (km * perKm) + (mins * perMin)) * m);

        const prices = [
            baseFare(55, 14, 1.8, mult.uber),
            baseFare(40, 11, 1.3, mult.ola),
            baseFare(15, 5,  0.7, mult.rapido)
        ].filter(p => p !== null);
        const cheapest = prices.length ? Math.min(...prices) : 0;

        // Badge label from cab type
        const cabLabels = { bike:'BIKE', auto:'AUTO', mini:'ECONOMY', sedan:'SEDAN', suv:'PREMIUM', premium:'ELITE' };
        const badgeLabel = cabLabels[cab] || 'ECONOMY';

        document.getElementById('est-price').textContent   = `₹${cheapest}`;
        document.getElementById('est-badge').textContent   = badgeLabel;
        document.getElementById('est-pickup-text').textContent = pickupName || 'Pickup';
        document.getElementById('est-drop-text').textContent   = dropName   || 'Drop';

        card.classList.remove('hidden');
        // Re-trigger animation
        card.style.animation = 'none';
        card.offsetHeight; // reflow
        card.style.animation = '';
    }

    function hideLiveEstimateCard() {
        const card = document.getElementById('live-estimate-card');
        if (card) card.classList.add('hidden');
    }

    function addMarker(geo, label) {
        if (!map || !google.maps) return;
        try {
            const marker = new google.maps.Marker({
                position: { lat: geo.lat, lng: geo.lng },
                map: map,
                title: label,
            });
            markers.push(marker);
        } catch(e) {}
    }

    function generateComparisonCard(miles, mins, distanceKm, cabType, passengers) {
        const km = parseFloat(distanceKm);
        const pax = parseInt(passengers) || 1;
        const cab = (cabType || 'Mini').toLowerCase();

        // Cab type multipliers
        const cabMultipliers = {
            bike:    { uber: 0,    ola: 0,    rapido: 1.0, label: '🏍️ Bike' },
            auto:    { uber: 0,    ola: 0.8,  rapido: 0,   label: '🛺 Auto' },
            mini:    { uber: 0.9,  ola: 0.85, rapido: 0,   label: '🚕 Mini' },
            sedan:   { uber: 1.0,  ola: 1.0,  rapido: 0,   label: '🚗 Sedan' },
            suv:     { uber: 1.35, ola: 1.3,  rapido: 0,   label: '🚙 SUV' },
            premium: { uber: 1.6,  ola: 1.5,  rapido: 0,   label: '⭐ Premium' },
        };
        const mult = cabMultipliers[cab] || cabMultipliers['mini'];

        // Base Indian pricing (₹) with cab multipliers
        const baseFare = (base, perKm, perMin, multiplier) =>
            multiplier === 0 ? null : Math.round((base + (km * perKm) + (mins * perMin)) * multiplier);

        let uberPrice   = baseFare(55, 14, 1.8, mult.uber);
        let olaPrice    = baseFare(40, 11, 1.3, mult.ola);
        let rapidoPrice = baseFare(15, 5,  0.7, mult.rapido);

        // Passenger surcharge (> 4 people picks SUV automatically or adds surcharge)
        if (pax > 4 && cab !== 'suv') {
            if (uberPrice)   uberPrice   = Math.round(uberPrice * 1.2);
            if (olaPrice)    olaPrice    = Math.round(olaPrice * 1.2);
        }

        // Surge pricing simulation
        const hour = new Date().getHours();
        const isSurge = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
        const surgeLabel = isSurge ? `<span style="color:#FF3CAC; font-size:0.75rem; margin-left:4px;">⚡ Surge</span>` : '';
        if (isSurge) {
            if (uberPrice)   uberPrice   = Math.round(uberPrice * 1.3);
            if (olaPrice)    olaPrice    = Math.round(olaPrice * 1.2);
            if (rapidoPrice) rapidoPrice = Math.round(rapidoPrice * 1.1);
        }

        const fmt = (p) => p === null ? '<span style="color:var(--text-muted); font-size:0.85rem;">Not available</span>' : `₹${p}`;

        // Find the cheapest available
        const prices = [uberPrice, olaPrice, rapidoPrice].filter(p => p !== null);
        const cheapest = prices.length ? Math.min(...prices) : null;

        const bestTag = (p) => (p !== null && p === cheapest)
            ? `<span style="font-size:0.7rem; color:#D5F81D; margin-left:4px;">✓ Best</span>` : '';

        const passengerWarn = pax > 4 && cab !== 'suv'
            ? `<div style="padding:10px 16px; font-size:0.8rem; color:#FFE53B; border-top:1px solid rgba(255,255,255,0.08);">⚠️ ${pax} passengers may need an SUV for comfort.</div>` : '';

        return `
        <div class="comparison-card">
            <div class="comp-header">🚖 Fare Comparison ${mult.label}${surgeLabel}</div>

            <div class="comp-row${uberPrice === cheapest ? ' best-deal' : ''}">
                <div class="comp-brand">
                    <div class="brand-icon icon-uber">U</div> UberX
                </div>
                <div class="comp-price-col">
                    <div class="comp-price">${fmt(uberPrice)}${bestTag(uberPrice)}</div>
                    <div class="comp-time">~${uberPrice ? Math.max(2, Math.round(mins/5)) : '—'} min away</div>
                </div>
            </div>

            <div class="comp-row${olaPrice === cheapest ? ' best-deal' : ''}">
                <div class="comp-brand">
                    <div class="brand-icon icon-ola">O</div> Ola
                </div>
                <div class="comp-price-col">
                    <div class="comp-price">${fmt(olaPrice)}${bestTag(olaPrice)}</div>
                    <div class="comp-time">~${olaPrice ? Math.max(3, Math.round(mins/4)) : '—'} min away</div>
                </div>
            </div>

            <div class="comp-row${rapidoPrice === cheapest ? ' best-deal' : ''}">
                <div class="comp-brand">
                    <div class="brand-icon icon-rapido">R</div> Rapido
                </div>
                <div class="comp-price-col">
                    <div class="comp-price">${fmt(rapidoPrice)}${bestTag(rapidoPrice)}</div>
                    <div class="comp-time">~${rapidoPrice ? Math.max(1, Math.round(mins/6)) : '—'} min away</div>
                </div>
            </div>
            ${passengerWarn}
        </div>`;
    }

    // Quick reply chip buttons
    function showQuickReplies(options) {
        // Remove any existing quick reply row first
        const existing = chatContainer.querySelector('.quick-replies');
        if (existing) existing.remove();

        const row = document.createElement('div');
        row.className = 'quick-replies';

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'quick-reply-btn';
            btn.textContent = opt.label;
            btn.addEventListener('click', () => {
                row.remove(); // remove chips after selection
                messageInput.value = opt.value;
                chatForm.dispatchEvent(new Event('submit'));
            });
            row.appendChild(btn);
        });

        chatContainer.appendChild(row);
        scrollToBottom();
    }

    function appendMessage(text, sender, addToHistory = true) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (addToHistory && currentSession) {
            currentSession.messages.push({ text: String(text), sender: String(sender), timestamp });
        }
        renderMessageToDOM(String(text), String(sender), String(timestamp));
    }

    function renderMessageToDOM(text, sender, timestamp) {
        if(!chatContainer) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        const formattedText = sender === 'user' ? escapeHTML(text) : parseMarkdown(text);
        messageDiv.innerHTML = `
            <div class="bubble">${formattedText}</div>
            <div class="time">${timestamp}</div>
        `;
        chatContainer.appendChild(messageDiv);
        scrollToBottom();
    }

    function parseMarkdown(str) {
        if(!str) return '';
        return String(str)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    function showTypingIndicator() {
        const id = 'typing-' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ai';
        messageDiv.id = id;
        messageDiv.innerHTML = `
            <div class="bubble">
                <div class="typing-indicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>`;
        if(chatContainer) {
            chatContainer.appendChild(messageDiv);
            scrollToBottom();
        }
        return id;
    }

    function scrollToBottom() {
        if(chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function escapeHTML(str) {
        if(!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
    }
});
