import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    // --- Firebase Config & Init ---
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // --- App State ---
    let currentUserProfile = null;
    const TOTAL_SIMULATORS = 10;
    const bookingState = { date: null, time: null };
    let isAuthReady = false;

    // --- Page Navigation ---
    const mainPage = document.getElementById('main-page');
    const bookingPage = document.getElementById('booking-page');
    const menuPage = document.getElementById('menu-page');
    const authPage = document.getElementById('auth-page');
    const profilePage = document.getElementById('profile-page');
    const rewardsPage = document.getElementById('rewards-page');
    const experiencePage = document.getElementById('experience-page');
    const allPages = [mainPage, bookingPage, menuPage, authPage, profilePage, rewardsPage, experiencePage];
    
    let initBookingPage;

    const togglePage = (pageId) => {
        window.scrollTo(0, 0);
        allPages.forEach(p => p.classList.add('hidden'));
        const pageToShow = document.getElementById(pageId);
        if(pageToShow) pageToShow.classList.remove('hidden');

        if (pageId === 'booking-page' && isAuthReady) {
            initBookingPage();
        } else if (pageId === 'booking-page' && !isAuthReady) {
            document.getElementById('time-slots-container').innerHTML = '<div class="flex justify-center col-span-full"><div class="loader"></div></div>';
        }

        if (pageId === 'profile-page') renderProfilePage();
        if (pageId === 'rewards-page') renderRewardsPage();
    };

    document.body.addEventListener('click', (e) => {
        const navLink = e.target.closest('.nav-link');
        if (navLink) {
             e.preventDefault();
            const pageId = navLink.dataset.page;
            const scrollToId = navLink.getAttribute('href');

            if (pageId !== 'main-page') {
                togglePage(pageId);
            } else {
                togglePage('main-page');
                if (scrollToId && scrollToId.startsWith('#')) {
                     setTimeout(() => {
                        document.querySelector(scrollToId)?.scrollIntoView({ behavior: 'smooth' });
                    }, 50);
                }
            }
            document.getElementById('mobile-menu').classList.add('hidden');
        }
    });

    // --- Gemini API Call Helper ---
    const callGemini = async (prompt, button) => {
        const modal = document.getElementById('ai-modal');
        const modalContent = document.getElementById('ai-modal-content');
        
        modal.classList.remove('hidden');
        modalContent.innerHTML = '<div class="flex justify-center items-center h-full"><div class="loader"></div></div>';

        const originalButtonText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<div class="loader !w-5 !h-5 !border-2 mx-auto"></div>';

        try {
            let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
            const payload = { contents: chatHistory };
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.candidates && result.candidates[0].content.parts[0].text) {
                const generatedText = result.candidates[0].content.parts[0].text;
                modalContent.innerHTML = marked.parse(generatedText);
            } else {
                 throw new Error("No content received from API.");
            }
        } catch(error) {
            console.error("Gemini API Error:", error);
            modalContent.innerHTML = `<p class="text-red-400">Sorry, we hit a red flag. The AI couldn't generate a response. Please try again later.</p>`;
        } finally {
             button.disabled = false;
             button.innerHTML = originalButtonText;
        }
    };
    
    // AI Features Setup
    document.getElementById('generate-event-btn').addEventListener('click', e => {
        const eventType = document.getElementById('event-type').value || "a racing-themed party";
        const guestCount = document.getElementById('guest-count').value || "a group of friends";
        const prompt = `Generate some creative event ideas and a sample invitation for ${eventType} for ${guestCount} at 'Horizon', a premium social racing arcade with advanced simulators. Make the tone exciting and exclusive. The output should be in markdown format.`;
        callGemini(prompt, e.currentTarget);
    });
    
    document.getElementById('generate-mocktail-btn').addEventListener('click', e => {
        const flavors = document.getElementById('mocktail-flavors').value || "something refreshing and cool";
        const prompt = `Create a unique, racing-themed mocktail recipe with a cool name based on these flavor profiles: ${flavors}. The recipe should be for one serving and easy for a bartender to make. Provide the name, a short description, ingredients, and instructions. Format it nicely in markdown.`;
        callGemini(prompt, e.currentTarget);
    });
    
    document.getElementById('close-ai-modal-btn').addEventListener('click', () => {
        document.getElementById('ai-modal').classList.add('hidden');
    });
    
     document.getElementById('close-confirmation-modal-btn').addEventListener('click', () => {
        document.getElementById('booking-confirmation-modal').classList.add('hidden');
    });

    // --- Main Page & Menu Logic ---
    document.getElementById('mobile-menu-button').addEventListener('click', () => document.getElementById('mobile-menu').classList.toggle('hidden'));
    const header = document.getElementById('header');
    window.addEventListener('scroll', () => { header.classList.toggle('bg-stone-900/80', window.scrollY > 50); header.classList.toggle('backdrop-blur-sm', window.scrollY > 50); });
    const observer = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); }); }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    // --- Authentication UI & Logic ---
    const desktopAuthContainer = document.getElementById('desktop-auth-buttons');
    const mobileAuthContainer = document.getElementById('mobile-auth-buttons');
    
    const updateAuthUI = (user, profile) => {
        let desktopHTML, mobileHTML;
        if (user && !user.isAnonymous) {
            const name = profile?.name ? profile.name.split(' ')[0] : 'Racer';
            desktopHTML = `<a href="#" class="nav-link text-gray-300 hover:text-amber-400" data-page="rewards-page">Rewards</a><a href="#" class="nav-link text-amber-400 hover:text-amber-200" data-page="profile-page">Hi, ${name}</a><button id="logout-btn-desktop" class="text-gray-300 hover:text-white text-sm">Logout</button>`;
            mobileHTML = `<a href="#" class="nav-link block text-center py-3 text-amber-400" data-page="profile-page">View Profile</a><a href="#" class="nav-link block text-center py-3 text-gray-300" data-page="rewards-page">Rewards</a><button id="logout-btn-mobile" class="block w-full text-center bg-gray-600 text-white font-bold py-3 px-6 rounded-lg mt-2">Logout</button>`;
        } else {
            desktopHTML = `<button class="nav-link text-gray-300 hover:text-white" data-page="auth-page">Login</button><button class="nav-link bg-amber-500 text-stone-900 font-bold py-2 px-5 rounded-lg btn-glow hover:bg-amber-400" data-page="auth-page">Sign Up</button>`;
            mobileHTML = `<button class="nav-link block w-full text-center bg-amber-500 text-stone-900 font-bold py-3 px-6 rounded-lg btn-glow" data-page="auth-page">Login / Sign Up</button>`;
        }
        desktopAuthContainer.innerHTML = desktopHTML;
        mobileAuthContainer.innerHTML = mobileHTML;

        document.getElementById('logout-btn-desktop')?.addEventListener('click', handleLogout);
        document.getElementById('logout-btn-mobile')?.addEventListener('click', handleLogout);
    };

    const handleLogout = () => {
        signOut(auth).then(() => {
            togglePage('main-page');
        }).catch(error => console.error("Logout Error:", error));
    };
    
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    document.getElementById('show-signup-btn').addEventListener('click', () => { loginView.classList.add('hidden'); signupView.classList.remove('hidden'); });
    document.getElementById('show-login-btn').addEventListener('click', () => { signupView.classList.add('hidden'); loginView.classList.remove('hidden'); });
    const loginForm = document.getElementById('login-form');
    const loginMessage = document.getElementById('login-message');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginMessage.textContent = '';
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try { await signInWithEmailAndPassword(auth, email, password); } 
        catch (error) { loginMessage.textContent = error.message.replace('Firebase: ', ''); }
    });

    const signupForm = document.getElementById('signup-form');
    const signupMessage = document.getElementById('signup-message');
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        signupMessage.textContent = '';
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const phone = document.getElementById('signup-phone').value;
        const dob = document.getElementById('signup-dob').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;
        if (password !== confirmPassword) { signupMessage.textContent = "Passwords do not match."; return; }
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
            await setDoc(userDocRef, { name, email, phone, dob, loyaltyPoints: 0, createdAt: serverTimestamp() });
        } catch (error) { signupMessage.textContent = error.message.replace('Firebase: ', ''); }
    });
    
    onAuthStateChanged(auth, async (user) => {
        isAuthReady = true;
        if (user && !user.isAnonymous) {
            const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
            const docSnap = await getDoc(userDocRef);
            currentUserProfile = docSnap.exists() ? { uid: user.uid, ...docSnap.data() } : { uid: user.uid, name: user.email, loyaltyPoints: 0 };
            updateAuthUI(user, currentUserProfile);
            if (!authPage.classList.contains('hidden')) { togglePage('main-page'); }
        } else {
            currentUserProfile = user ? { uid: user.uid, isAnonymous: true } : null;
            updateAuthUI(null, null);
        }
        if (!bookingPage.classList.contains('hidden')) initBookingPage();
    });
    
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else if (!auth.currentUser) {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Initial sign-in failed:", error);
    }

    // --- Profile & Rewards Page Logic ---
    const renderProfilePage = () => {
        if (!currentUserProfile || currentUserProfile.isAnonymous) { togglePage('auth-page'); return; }
        document.getElementById('profile-welcome-name').textContent = `Welcome back, ${currentUserProfile.name}!`;
        document.getElementById('profile-loyalty-points-display').textContent = currentUserProfile.loyaltyPoints || 0;
        document.getElementById('profile-detail-name').textContent = currentUserProfile.name || 'N/A';
        document.getElementById('profile-detail-email').textContent = currentUserProfile.email || 'N/A';
        document.getElementById('profile-detail-phone').textContent = currentUserProfile.phone || 'N/A';
    };

    const renderRewardsPage = () => {
        if (!currentUserProfile || currentUserProfile.isAnonymous) { togglePage('auth-page'); return; }
        document.getElementById('rewards-loyalty-points-display').textContent = currentUserProfile.loyaltyPoints || 0;
        renderRewardsList();
    }

    const renderRewardsList = () => {
        const rewards = [ { name: 'Free Mocktail', points: 100, icon: '🍹' }, { name: 'Horizon Keychain', points: 250, icon: '🔑' }, { name: '30 Min Bonus Sim Time', points: 500, icon: '⏱️' }, { name: 'Horizon T-Shirt', points: 750, icon: '👕' }, { name: 'VIP Race Event Entry', points: 1500, icon: '🏆' }, { name: 'Private Sim Party (1hr)', points: 2500, icon: '🎉' } ];
        const container = document.getElementById('rewards-container');
        container.innerHTML = '';
        const currentPoints = currentUserProfile.loyaltyPoints || 0;
        rewards.forEach(reward => {
            const unlocked = currentPoints >= reward.points;
            const card = document.createElement('div');
            card.className = `reward-card card-glass p-6 rounded-2xl text-center flex flex-col items-center justify-between transition-all duration-300 ${unlocked ? 'unlocked' : ''}`;
            card.innerHTML = `<div class="text-5xl mb-4">${reward.icon}</div><div><h4 class="text-xl font-bold">${reward.name}</h4><p class="text-gradient font-bold text-lg">${reward.points} Points</p></div><button class="w-full mt-4 bg-amber-600 text-white font-bold py-2 px-4 rounded-lg btn-glow" ${!unlocked ? 'disabled' : ''}>${unlocked ? 'Redeem' : 'Locked'}</button>`;
            container.appendChild(card);
        });
    };

    // --- Booking Logic ---
    const dateInput = document.getElementById('booking-date');
    const timeSlotsContainer = document.getElementById('time-slots-container');
    const bookingForm = document.getElementById('booking-form');
    const simCountInput = document.getElementById('simulator-count');
    const bookingMessageEl = document.getElementById('booking-message');
    const confirmationModal = document.getElementById('booking-confirmation-modal');
    const confirmationDetailsEl = document.getElementById('booking-confirmation-details');

    initBookingPage = () => {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        dateInput.setAttribute('min', today);
        bookingState.date = today;
        
        // Clear validation states for slots
        document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
        bookingState.time = null;

        if (currentUserProfile && !currentUserProfile.isAnonymous) {
            document.getElementById('booking-name').value = currentUserProfile.name || '';
            document.getElementById('booking-email').value = currentUserProfile.email || '';
        } else {
             document.getElementById('booking-name').value = '';
             document.getElementById('booking-email').value = '';
        }
        updateAvailableSlots(today);
    };

    const updateAvailableSlots = async (dateStr) => {
        bookingState.date = dateStr;
        bookingState.time = null;
        timeSlotsContainer.innerHTML = '<div class="flex justify-center col-span-full"><div class="loader"></div></div>'; // show loader
        const q = query(collection(db, `artifacts/${appId}/public/data/bookings`), where("date", "==", dateStr));
        try {
            const querySnapshot = await getDocs(q);
            const bookingsByTime = {};
            querySnapshot.forEach(doc => { const b = doc.data(); bookingsByTime[b.time] = (bookingsByTime[b.time] || 0) + b.simulators; });
            renderTimeSlots(bookingsByTime);
        } catch (error) {
            // For a pure frontend experience, we can ignore this error and just render all slots as available.
            console.log("Offline mode: Rendering all slots as available.");
            renderTimeSlots({});
        }
    };
    
    const renderTimeSlots = (bookingsByTime) => {
        timeSlotsContainer.innerHTML = '';
        for (let hour = 11; hour <= 22; hour++) {
            const time = `${hour.toString().padStart(2, '0')}:00`;
            const bookedCount = bookingsByTime[time] || 0; // Will be 0 in offline mode
            const availableCount = TOTAL_SIMULATORS - bookedCount;
            const slotBtn = document.createElement('button');
            slotBtn.type = 'button'; slotBtn.className = 'time-slot p-3 rounded-lg font-semibold'; slotBtn.dataset.time = time;
            slotBtn.innerHTML = `${time}<br><span class="text-xs font-normal">${availableCount} left</span>`;
            if (availableCount <= 0) slotBtn.disabled = true;
            slotBtn.addEventListener('click', () => {
                document.querySelectorAll('.time-slot.selected').forEach(s => s.classList.remove('selected'));
                slotBtn.classList.add('selected'); bookingState.time = time;
                simCountInput.max = availableCount;
                if (parseInt(simCountInput.value) > availableCount) simCountInput.value = availableCount;
            });
            timeSlotsContainer.appendChild(slotBtn);
        }
    };

    dateInput.addEventListener('change', () => {
        // In the simplified version, we don't need to re-fetch from the database.
        // We just reset the selection.
         bookingState.date = dateInput.value;
         document.querySelectorAll('.time-slot.selected').forEach(s => s.classList.remove('selected'));
         bookingState.time = null;
    });
    
    bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        bookingMessageEl.textContent = '';
        const name = document.getElementById('booking-name').value;
        const email = document.getElementById('booking-email').value;
        const simsToBook = parseInt(simCountInput.value);
        const date = document.getElementById('booking-date').value;
        const time = bookingState.time;


        if (!date || !time || !name || !email || !simsToBook) {
            bookingMessageEl.innerHTML = `<p class="text-red-400">Please fill all fields and select a slot.</p>`;
            return;
        }

        // --- Simplified Frontend-Only Confirmation ---

        // Show confirmation modal
        confirmationDetailsEl.innerHTML = `
            <p><strong>Racer:</strong> ${name}</p>
            <p><strong>Date:</strong> ${new Date(date).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Time:</strong> ${time}</p>
            <p><strong>Simulators:</strong> ${simsToBook}</p>
        `;
        confirmationModal.classList.remove('hidden');

        // Reset the form for the next booking
        bookingForm.reset(); 
        initBookingPage();
    });
    
    // --- Menu Page Logic ---
    const foodMenuData = [
        { name: 'Apex Sliders', price: '₹350', description: 'Two juicy mini-burgers with our signature pit-stop sauce.' },
        { name: 'Chicane Chicken Wings', price: '₹400', description: 'Crispy wings tossed in your choice of spicy or BBQ sauce.' },
        { name: 'Podium Fries', price: '₹250', description: 'Loaded fries with cheese sauce, jalapenos, and crispy onions.' },
        { name: 'Grid-Start Nachos', price: '₹300', description: 'A mountain of tortilla chips with cheese, salsa, and guacamole.' },
        { name: 'Paddock Pizza Pockets', price: '₹320', description: 'Three pizza pockets with mozzarella and a zesty tomato filling.' },
        { name: 'Finish Line Fish & Chips', price: '₹450', description: 'Classic battered fish with a side of perfectly salted chips.' },
    ];
    
    const drinksMenuData = [
        { name: 'The Monza', price: '₹200', description: 'A sharp, refreshing mix of cranberry, lime, and a hint of mint.' },
        { name: 'Silverstone Splash', price: '₹220', description: 'Cooling cucumber and elderflower tonic. A British classic.' },
        { name: 'Eau Rouge Rush', price: '₹250', description: 'A fiery blend of ginger, chili, and passionfruit for the brave.' },
        { name: 'Classic Soft Drinks', price: '₹100', description: 'Coke, Diet Coke, Sprite, Fanta.' },
        { name: 'Energy Drinks', price: '₹180', description: 'Red Bull, Monster Energy.' },
        { name: 'Fresh Juices', price: '₹150', description: 'Orange, Watermelon, or Pineapple.' },
    ];

    const renderMenuItems = (data, container) => {
        container.innerHTML = data.map(item => `
            <div class="menu-item">
                <span class="menu-item-name">${item.name}</span>
                <span class="menu-item-price">${item.price}</span>
                <p class="menu-item-description">${item.description}</p>
            </div>
        `).join('');
    };
    
    const foodMenuContainer = document.querySelector('#food-menu .grid');
    const drinksMenuContainer = document.querySelector('#drinks-menu .grid');
    renderMenuItems(foodMenuData, foodMenuContainer);
    renderMenuItems(drinksMenuData, drinksMenuContainer);
    
    const menuTabs = document.querySelectorAll('.menu-tab');
    menuTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            menuTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.menu-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tab.dataset.menu).classList.add('active');
        });
    });

    // --- Initial UI Setup & Dummy Auth Flow ---
    // This part is simplified to not require real authentication for booking pop-up
    initBookingPage();
    updateAuthUI(null, null); // Start as logged out
    
    // Still need the logic to switch between auth and main pages
    const userDocRef = doc(db, `artifacts/${appId}/public/data/dummyUser`); // Use a dummy doc for offline mode
    onAuthStateChanged(auth, async (user) => {
        isAuthReady = true;
        if (user && !user.isAnonymous) {
            const docSnap = await getDoc(userDocRef); // This will likely fail offline but we can handle it
            currentUserProfile = docSnap.exists() ? { uid: user.uid, ...docSnap.data() } : { uid: user.uid, name: user.email, loyaltyPoints: 0 };
            updateAuthUI(user, currentUserProfile);
            if (!authPage.classList.contains('hidden')) { togglePage('main-page'); }
        } else {
            currentUserProfile = null;
            updateAuthUI(null, null);
        }
    });

});