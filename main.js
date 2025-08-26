import './style.css'

// Global references for mobile menu and modal access
let globalCloseMobileMenu = null; // Global reference to close mobile menu
let globalLoginModal = null;
let globalSignupModal = null;
let globalModalOverlay = null;
let globalOpenModal = null;

// Avatar utilities (local cache + Firestore fallback)
// ===== Debug Log Capture (to help collect console output) =====
// Enable capturing of console logs so they can be exported for remote debugging
;(function setupDebugLogCapture(){
  if (window.__APP_LOG_CAPTURE__) return; // avoid double wrapping
  const CAPTURE_ENABLED = true; // toggle if needed
  if (!CAPTURE_ENABLED) return;
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
  };
  const buffer = [];
  const MAX = 1500; // keep last 1500 entries
  function maskSecrets(msg){
    try {
      if (typeof msg === 'string') {
        // crude masking for api keys / firebase apiKey patterns
        return msg.replace(/AIza[0-9A-Za-z\-_]{10,}/g,'[API_KEY_MASKED]');
      }
    } catch {}
    return msg;
  }
  function push(type, args){
    const time = new Date().toISOString();
    const safeArgs = Array.from(args).map(maskSecrets);
    buffer.push({ time, type, args: safeArgs });
    if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  }
  ['log','warn','error','info','debug'].forEach(level => {
    console[level] = function(){
      push(level, arguments);
      original[level](...arguments);
    };
  });
  window.__APP_LOG_CAPTURE__ = {
    getLogs: () => buffer.slice(),
    clear: () => { buffer.length = 0; },
    download: () => {
      try {
        const blob = new Blob([JSON.stringify(buffer,null,2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'app-console-logs.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
      } catch(e) { original.error('Failed to download logs', e); }
    }
  };
  window.getAppLogs = () => window.__APP_LOG_CAPTURE__.getLogs();
  window.downloadAppLogs = () => window.__APP_LOG_CAPTURE__.download();
  original.log('📝 Console log capture enabled. Use getAppLogs() or downloadAppLogs().');
})();

// Helper to quickly inspect auth + avatar state
window.debugAuthState = function(){
  const auth = window.firebaseAuth;
  const user = auth && auth.currentUser;
  const cached = localStorage.getItem('firebase_cached_user');
  const parsedCached = (()=>{ try { return JSON.parse(cached); } catch { return null; } })();
  return {
    hasAuth: !!auth,
    user: user ? {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      providerData: user.providerData
    } : null,
    cachedUser: parsedCached,
    localAvatarCacheKeys: Object.keys(localStorage).filter(k=>k.startsWith('avatar_cache_')),
    avatarElementSrc: (document.getElementById('userAvatar')||{}).src || null,
    location: window.location.href
  };
};

// Local cache key helper
function avatarCacheKey(uid) {
  return `avatar_cache_${uid}`;
}

function getCachedAvatar(uid) {
  try {
    const raw = localStorage.getItem(avatarCacheKey(uid));
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expire after 7 days
    if (Date.now() - (data.cachedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(avatarCacheKey(uid));
      return null;
    }
    return data.url || null;
  } catch { return null; }
}

function setCachedAvatar(uid, url) {
  try {
    localStorage.setItem(avatarCacheKey(uid), JSON.stringify({
      url: url,
      cachedAt: Date.now()
    }));
  } catch (error) {
    console.warn('⚠️ Failed to cache avatar:', error);
  }
}

// Improved image URL testing function
function testImageUrl(url, timeout = 5000) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    
    img.onload = () => {
      console.log('✅ Image loaded successfully:', url);
      finish(true);
    };
    
    img.onerror = () => {
      console.log('❌ Image failed to load:', url);
      finish(false);
    };
    
    // For Google avatars, don't add cache-busting parameters as they can break the URL
    if (url.includes('googleusercontent.com')) {
      img.src = url;
    } else {
      // Add cache-busting only for non-Google URLs
      img.src = url + (url.includes('?') ? '&' : '?') + '_avtest=' + Date.now();
    }
    
    setTimeout(() => {
      if (!done) {
        console.log('⏰ Image test timeout:', url);
        finish(false);
      }
    }, timeout);
  });
}

// Firestore persistence (optional)
async function saveAvatarToFirestore(user, avatarUrl) {
  try {
    const db = window.firebaseDb;
    if (!db) {
      console.warn('⚠️ Firestore not available for avatar storage');
      return false;
    }
    
    console.log('💾 Saving avatar to Firestore for user:', user.uid);
    
    await db.collection('userAvatars').doc(user.uid).set({
      avatarUrl: avatarUrl,
      userId: user.uid,
      userEmail: user.email,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      source: 'google'
    });
    
    console.log('✅ Avatar saved to Firestore successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to save avatar to Firestore:', error);
    return false;
  }
}

async function loadAvatarFromFirestore(user) {
  try {
    const db = window.firebaseDb;
    if (!db) {
      console.warn('⚠️ Firestore not available for avatar loading');
      return null;
    }
    
    console.log('📥 Loading avatar from Firestore for user:', user.uid);
    
    const doc = await db.collection('userAvatars').doc(user.uid).get();
    
    if (doc.exists) {
      const data = doc.data();
      console.log('✅ Avatar loaded from Firestore:', data.avatarUrl);
      return data.avatarUrl;
    } else {
      console.log('ℹ️ No saved avatar found in Firestore');
      return null;
    }
  } catch (error) {
    console.error('❌ Failed to load avatar from Firestore:', error);
    return null;
  }
}

// Improved Google avatar processing
async function processAndSaveGoogleAvatar(user) {
  try {
    const rawUrl = user.photoURL;
    if (!rawUrl) {
      console.log('ℹ️ User has no photoURL');
      return null;
    }
    
    // For non-Google avatars, test the URL directly
    if (!/googleusercontent\.com/i.test(rawUrl)) {
      console.log('ℹ️ Non-Google avatar, using provided URL directly');
      const ok = await testImageUrl(rawUrl);
      if (ok) {
        setCachedAvatar(user.uid, rawUrl);
        saveAvatarToFirestore(user, rawUrl); // fire & forget
        return rawUrl;
      }
      return null;
    }

    console.log('🔧 Processing Google avatar:', rawUrl);

    // Test the original URL first
    const originalOk = await testImageUrl(rawUrl);
    if (originalOk) {
      console.log('✅ Original Google avatar URL works:', rawUrl);
      setCachedAvatar(user.uid, rawUrl);
      saveAvatarToFirestore(user, rawUrl);
      return rawUrl;
    }

    // If original doesn't work, try different size parameters
    const baseUrl = rawUrl.split('?')[0].replace(/=s\d+(-c)?/gi, '');
    
    // Common Google avatar size parameters
    const sizeParams = [
      '=s96-c',  // 96px with crop
      '=s128-c', // 128px with crop
      '=s192-c', // 192px with crop
      '=s256-c', // 256px with crop
      '=s96',    // 96px without crop
      '=s128',   // 128px without crop
      '=s192',   // 192px without crop
      '=s256'    // 256px without crop
    ];

    // Test each size variant
    for (const sizeParam of sizeParams) {
      const testUrl = baseUrl + sizeParam;
      console.log('🧪 Testing Google avatar variant:', testUrl);
      
      const ok = await testImageUrl(testUrl);
      if (ok) {
        console.log('✅ Working Google avatar URL found:', testUrl);
        setCachedAvatar(user.uid, testUrl);
        saveAvatarToFirestore(user, testUrl);
        return testUrl;
      }
    }

    // If no size variants work, try the original URL without any parameters
    const cleanUrl = baseUrl;
    console.log('🧪 Testing clean Google avatar URL:', cleanUrl);
    const cleanOk = await testImageUrl(cleanUrl);
    if (cleanOk) {
      console.log('✅ Clean Google avatar URL works:', cleanUrl);
      setCachedAvatar(user.uid, cleanUrl);
      saveAvatarToFirestore(user, cleanUrl);
      return cleanUrl;
    }

    console.warn('❌ No working Google avatar variant found');
    return null;
  } catch (error) {
    console.error('❌ Error processing Google avatar:', error);
    return null;
  }
}

// Main Firebase Avatar Loading Function
async function loadUserAvatarFromFirebase(user, userAvatarElement) {
  const nameForFallback = (user.displayName || user.email.split('@')[0] || 'User').trim();
  
  function setFallbackAvatar() {
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForFallback)}&background=667eea&color=fff&size=64&rounded=true&bold=true`;
    userAvatarElement.src = fallbackUrl;
    console.log('🎨 Using generated avatar as fallback');
  }
  
  try {
    // Step 0: Local cache first
    const cached = getCachedAvatar(user.uid);
    if (cached) {
      const ok = await testImageUrl(cached, 4000);
      if (ok) {
        userAvatarElement.src = cached;
        console.log('✅ Loaded avatar from local cache');
        return;
      } else {
        console.log('⚠️ Cached avatar invalid, clearing');
        localStorage.removeItem(avatarCacheKey(user.uid));
      }
    }

    // Step 1: Firestore
    console.log('📥 Attempting to load avatar from Firestore...');
    const storedAvatarUrl = await loadAvatarFromFirestore(user);
    if (storedAvatarUrl) {
      const ok = await testImageUrl(storedAvatarUrl, 5000);
      if (ok) {
        userAvatarElement.src = storedAvatarUrl;
        console.log('✅ Firestore avatar loaded successfully');
        setCachedAvatar(user.uid, storedAvatarUrl);
        return;
      } else {
        console.warn('⚠️ Stored Firestore avatar invalid, will process new Google avatar');
      }
    }

    // Step 2: Process new Google avatar or fallback to original photoURL
    console.log('ℹ️ Processing Google avatar variants...');
    processNewGoogleAvatar();
  } catch (error) {
    console.error('❌ Error in Firebase avatar loading:', error);
    setFallbackAvatar();
  }
  
  async function processNewGoogleAvatar() {
    try {
      const workingAvatarUrl = await processAndSaveGoogleAvatar(user);
      
      if (workingAvatarUrl) {
        userAvatarElement.src = workingAvatarUrl;
        console.log('✅ New Google avatar processed and loaded');
      } else {
        console.warn('⚠️ Could not process Google avatar, using fallback');
        setFallbackAvatar();
      }
    } catch (error) {
      console.error('❌ Error processing new Google avatar:', error);
      setFallbackAvatar();
    }
  }
}

// App version for cache busting
const APP_VERSION = '2.1.0';
const VERSION_CHECK_INTERVAL = 60000; // Check every 60 seconds (reduced frequency)
let lastUpdateCheck = 0;
let updateNotificationShown = false;

// Mobile platform detection
function detectMobilePlatform() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  // Detect Android
  if (/android/i.test(userAgent)) {
    document.body.classList.add('mobile-android');
    console.log('📱 Android device detected - keyboard shortcuts hidden');
  }
  
  // Detect iOS (iPhone, iPad, iPod)
  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    document.body.classList.add('mobile-ios');
    console.log('📱 iOS device detected - keyboard shortcuts hidden');
  }
  
  // General mobile detection as fallback
  if (/Mobi|Android/i.test(userAgent)) {
    document.body.classList.add('mobile-device');
    console.log('📱 Mobile device detected');
  }
}

// Aggressive anti-caching function
function preventBrowserCaching() {
  // Clear any existing service worker registrations
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister();
        console.log('🧹 Cleared service worker:', registration.scope);
      }
    });
  }

  // Clear only specific cache-related storage, preserve Firebase auth
  try {
    // Don't clear localStorage completely - preserve Firebase auth tokens and game data
    const keysToPreserve = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('firebase:') || 
        key.includes('authUser') || 
        key === 'firebase_cached_user' ||
        key.startsWith('snakeHighScore') ||
        key === 'app_version' || 
        key === 'theme' || 
        key === 'siteVisited' ||
        key.includes('notepad') ||
        key.includes('timer')
      )) {
        keysToPreserve.push(key);
      }
    }
    
    // Store preserved values
    const preservedValues = {};
    keysToPreserve.forEach(key => {
      preservedValues[key] = localStorage.getItem(key);
    });
    
    console.log('🔍 Preserving localStorage keys:', keysToPreserve);
    
    // Clear storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Restore preserved values
    Object.entries(preservedValues).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
    
  console.log('✅ Restored preserved values:', Object.keys(preservedValues));
    
    // Don't clear IndexedDB as Firebase uses it for auth persistence
    console.log('🧹 Cleared browser cache storage (preserved Firebase auth and game data)');
  } catch (e) {
    console.log('⚠️ Could not clear some storage:', e);
  }

  // Add cache-busting parameters to all requests
  const timestamp = Date.now();
  
  // Override fetch to add cache-busting (but preserve original for external APIs)
  const originalFetch = window.fetch;
  window.originalFetch = originalFetch; // Store globally for external API access
  window.fetch = function(...args) {
    let url = args[0];
    if (typeof url === 'string') {
      // Skip cache-busting for external APIs (Google, etc.)
      if (url.includes('googleapis.com') || url.includes('huggingface.co')) {
        return originalFetch.apply(this, args);
      }
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}_cb=${timestamp}&_t=${Date.now()}`;
      args[0] = url;
    }
    return originalFetch.apply(this, args);
  };

  // Force reload stylesheets with cache busting
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  links.forEach(link => {
    const href = link.href.split('?')[0];
    link.href = `${href}?v=${timestamp}&t=${Date.now()}`;
  });

  // Monitor and prevent future caching (but preserve Firebase auth)
  setInterval(() => {
    // Clear only browser caches, not storage used by Firebase
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          // Don't clear Firebase-related caches
          if (!cacheName.includes('firebase') && !cacheName.includes('auth')) {
            caches.delete(cacheName);
          }
        });
      });
    }
    
    // Clear service workers that might register (but not Firebase ones)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          // Don't unregister Firebase-related service workers
          if (!registration.scope.includes('firebase')) {
            registration.unregister();
          }
        });
      });
    }
  }, 60000); // Check every 60 seconds (less aggressive)

  console.log('🚀 Anti-caching measures activated with monitoring');
}

// Cache busting and version control
function setupCacheBusting() {
  // Store the current version in localStorage
  const storedVersion = localStorage.getItem('app_version');
  if (!storedVersion) {
    localStorage.setItem('app_version', APP_VERSION);
  }
  
  // Check for updates if online
  if (navigator.onLine) {
    setTimeout(() => checkForUpdates(), 5000); // Initial check after 5 seconds
    
    // Periodic update checks with cooldown
    setInterval(() => {
      const now = Date.now();
      if (navigator.onLine && now - lastUpdateCheck > VERSION_CHECK_INTERVAL) {
        checkForUpdates();
        lastUpdateCheck = now;
      }
    }, VERSION_CHECK_INTERVAL);
  }
  
  // Listen for online events
  window.addEventListener('online', () => {
    const now = Date.now();
    if (now - lastUpdateCheck > 30000) { // At least 30 seconds between online checks
      checkForUpdates();
      lastUpdateCheck = now;
    }
  });
}

// Check for app updates
async function checkForUpdates() {
  try {
    // Prevent multiple simultaneous checks
    if (updateNotificationShown) {
      return;
    }

    // Fetch the main JS file to check for version changes
    const response = await fetch(`/main.js?v=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (response.ok) {
      const jsContent = await response.text();
      
      // Extract version from the fetched content
      const versionMatch = jsContent.match(/const APP_VERSION = ['"`]([^'"`]+)['"`]/);
      const fetchedVersion = versionMatch ? versionMatch[1] : null;
      
      // Compare with stored version
      const storedVersion = localStorage.getItem('app_version');
      
      if (fetchedVersion && fetchedVersion !== storedVersion && fetchedVersion !== APP_VERSION) {
        // Real version change detected
        console.log(`Update detected: ${storedVersion} → ${fetchedVersion}`);
        showUpdateNotification();
        updateNotificationShown = true;
      }
    }
  } catch (error) {
    console.log('Update check failed (offline or network error)');
  }
}

// Simple hash function for comparison
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

// Show update notification to user
function showUpdateNotification() {
  // Update notifications are disabled - function does nothing
  return;
}

// Update the app
function updateApp() {
  // Update stored version
  localStorage.setItem('app_version', APP_VERSION);
  // Force reload with cache clearing
  window.location.reload(true);
}

// Dismiss update notification
function dismissUpdate() {
  const notification = document.querySelector('.update-notification');
  if (notification) {
    notification.remove();
    updateNotificationShown = false;
    // Don't check for updates again for 10 minutes
    lastUpdateCheck = Date.now() + (10 * 60 * 1000);
  }
}

// Function to manually refresh avatar
window.refreshAvatar = function() {
  const auth = window.firebaseAuth;
  const userAvatar = document.getElementById('userAvatar');
  
  if (!auth || !auth.currentUser) {
    console.log('❌ No authenticated user to refresh avatar');
    return;
  }
  
  if (!userAvatar) {
    console.log('❌ User avatar element not found');
    return;
  }
  
  console.log('🔄 Manually refreshing avatar...');
  
  // Clear cache and reload
  localStorage.removeItem(avatarCacheKey(auth.currentUser.uid));
  loadUserAvatarFromFirebase(auth.currentUser, userAvatar);
  
  console.log('✅ Avatar refresh initiated');
};

// Function to debug logout functionality
window.debugLogout = function() {
  console.log('🔍 Debugging logout functionality...');
  
  const auth = window.firebaseAuth;
  const logoutBtn = document.getElementById('logoutBtn');
  
  console.log('🔧 Firebase auth object:', !!auth);
  console.log('🔧 Current user:', auth?.currentUser?.email);
  console.log('🔧 Logout button element:', !!logoutBtn);
  console.log('🔧 Logout button display:', logoutBtn?.style.display);
  console.log('🔧 Logout button visibility:', logoutBtn?.style.visibility);
  console.log('🔧 Logout button disabled:', logoutBtn?.disabled);
  
  if (logoutBtn) {
    console.log('🔧 Logout button clickable:', !logoutBtn.disabled && logoutBtn.style.display !== 'none');
    console.log('🔧 Logout button event listeners:', logoutBtn.onclick);
  }
  
  // Test if we can call signOut directly
  if (auth && auth.currentUser) {
    console.log('🧪 Testing direct signOut call...');
    auth.signOut().then(() => {
      console.log('✅ Direct signOut successful');
    }).catch((error) => {
      console.error('❌ Direct signOut failed:', error);
    });
  } else {
    console.log('ℹ️ No user to sign out');
  }
};

// App initialization
document.addEventListener('DOMContentLoaded', function() {
  // INSTANT AUTH STATE: Set initial display state BEFORE any other initialization
  // This prevents flash of login buttons for cached users
  const cachedUser = localStorage.getItem('firebase_cached_user');
  if (cachedUser) {
    try {
      const userData = JSON.parse(cachedUser); // Validate cached data
      console.log('⚡ Cached user detected, setting instant logged-in state:', userData.email);
      
      // Set initial state to logged-in IMMEDIATELY (before any other code runs)
      const authButtons = document.getElementById('authButtons');
      const userMenu = document.getElementById('userMenu');
      
      if (authButtons && userMenu) {
        authButtons.style.display = 'none';
        userMenu.style.display = 'flex';
        
        // Immediately populate user info to prevent empty state
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        
        if (userName) {
          userName.textContent = userData.displayName || userData.email.split('@')[0];
        }
        
        if (userAvatar && userData.photoURL) {
          // For instant display, use the cached photoURL directly
          userAvatar.src = userData.photoURL;
          console.log('⚡ Instant avatar set from cache:', userData.photoURL);
        } else if (userAvatar) {
          const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.displayName || userData.email)}&background=667eea&color=fff&size=64&rounded=true`;
          userAvatar.src = fallbackUrl;
          console.log('⚡ Instant fallback avatar set');
        }
        
        console.log('⚡ Initial DOM state set to logged-in user with data (no flash)');
      }
    } catch (e) {
      console.warn('⚠️ Invalid cached user data detected, will show auth buttons');
      localStorage.removeItem('firebase_cached_user');
      
      // Ensure auth buttons are shown if cache is invalid
      const authButtons = document.getElementById('authButtons');
      const userMenu = document.getElementById('userMenu');
      if (authButtons && userMenu) {
        authButtons.style.display = 'flex';
        userMenu.style.display = 'none';
      }
    }
  } else {
    console.log('⚡ No cached user, ensuring auth buttons are visible');
    // Ensure auth buttons are shown if no cached user
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    if (authButtons && userMenu) {
      authButtons.style.display = 'flex';
      userMenu.style.display = 'none';
    }
  }
  
  // Detect mobile platforms and add appropriate classes
  detectMobilePlatform();
  
  // Activate anti-caching measures first
  preventBrowserCaching();
  
  // Fix form encoding immediately when DOM is ready
  fixFormEncoding();
  
  // setupCacheBusting(); // DISABLED for instant updates
  // First-visit animation: only on first load
  if (!localStorage.getItem('siteVisited')) {
    const hero = document.querySelector('.hero-section');
    hero && hero.classList.add('animate-first');
    localStorage.setItem('siteVisited', 'true');
  }
  initializeApp();
  setupRouting();
  
  // Initialize Electron-specific features if running in Electron
  if (window.electronAPI) {
    initializeElectronFeatures();
  }
  
  // Instant Firebase authentication setup for immediate user display
  const setupInstantAuth = () => {
    console.log('⚡ Setting up instant authentication...');
    
    // Check if Firebase SDK is loaded
    if (typeof firebase === 'undefined') {
      console.error('❌ Firebase SDK not loaded');
      showNotification('Authentication service unavailable. Please refresh the page.', 'error');
      return;
    }
    
    // INSTANT USER DISPLAY: Check for cached user BEFORE showing any auth buttons
    const cachedUser = localStorage.getItem('firebase_cached_user');
    if (cachedUser) {
      try {
        const userData = JSON.parse(cachedUser);
        console.log('⚡ Cached user found, hiding auth buttons immediately:', userData.email);
        
        // Hide auth buttons and show user menu INSTANTLY (no flash)
        const authButtons = document.getElementById('authButtons');
        const userMenu = document.getElementById('userMenu');
        
        if (authButtons && userMenu) {
          // Set initial state to logged-in user (no flash of login buttons)
          authButtons.style.display = 'none';
          userMenu.style.display = 'flex';
          console.log('⚡ Auth buttons hidden instantly, user menu shown');
        }
        
        // Then populate user data
        showCachedUserMenu(userData);
        
      } catch (e) {
        console.warn('⚠️ Invalid cached user data, removing');
        localStorage.removeItem('firebase_cached_user');
        // Show auth buttons if cached data is invalid
        showInitialAuthButtons();
      }
    } else {
      // No cached user, show auth buttons
      console.log('⚡ No cached user, showing auth buttons');
      showInitialAuthButtons();
    }
    
    // Initialize Firebase immediately if config is available
    if (window.firebaseAuth && window.googleProvider) {
      setupAuthentication();
      console.log('⚡ Authentication system initialized instantly');
      return;
    }
    
    // If config not loaded yet, try backup initialization immediately
    if (!window.firebaseAuth) {
      console.log('⚡ Initializing Firebase with backup config...');
      initializeFirebaseBackup();
    }
  };
  
  // Function to show initial auth buttons if no cached user
  function showInitialAuthButtons() {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    
    if (authButtons && userMenu) {
      authButtons.style.display = 'flex';
      userMenu.style.display = 'none';
      console.log('⚡ Initial auth buttons displayed');
    }
  }
  
  setupInstantAuth();
  
  // Backup Firebase initialization function
  function initializeFirebaseBackup() {
    try {
      // Firebase Configuration (backup)
      const firebaseConfig = {
        apiKey: "AIzaSyD6dEYItWa6W6xhcQGQAg2YlSKW_pgplYA",
        authDomain: "sahil-s-web.firebaseapp.com",
        projectId: "sahil-s-web",
        storageBucket: "sahil-s-web.firebasestorage.app",
        messagingSenderId: "694102244011",
        appId: "1:694102244011:web:31feaf0b244fba9bbd95ee"
      };
      
      // Check if Firebase is already initialized
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      
      // Initialize Firebase Auth
      const auth = firebase.auth();
      
      // Google Auth Provider
      const googleProvider = new firebase.auth.GoogleAuthProvider();
      googleProvider.addScope('email');
      googleProvider.addScope('profile');
      googleProvider.setCustomParameters({
        prompt: 'select_account'
      });
      
      // Export for use
      window.firebaseAuth = auth;
      window.googleProvider = googleProvider;
      
      console.log('⚡ Backup Firebase initialization successful');
      setupAuthentication();
      
    } catch (error) {
      console.error('❌ Backup Firebase initialization failed:', error);
      showNotification('Authentication system failed to initialize. Some features may not work.', 'error');
    }
  }
  
  // Function to show cached user instantly while Firebase loads
  function showCachedUserMenu(userData) {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    
    if (authButtons && userMenu) {
      // Ensure auth buttons are hidden and user menu is shown
      authButtons.style.display = 'none';
      userMenu.style.display = 'flex';
      
      const userAvatar = document.getElementById('userAvatar');
      const userName = document.getElementById('userName');
      
      // Update user name if not already set
      if (userName && !userName.textContent) {
        userName.textContent = userData.displayName || userData.email.split('@')[0];
      }
      
      // Update avatar if not already set  
      if (userAvatar && userData.photoURL && !userAvatar.src) {
        // For Google avatars, use the improved loading system
        if (userData.photoURL.includes('googleusercontent.com')) {
          console.log('⚡ Cached Google avatar detected, using improved loading');
          // Create a temporary user object for the avatar loading function
          const tempUser = {
            uid: userData.uid,
            email: userData.email,
            displayName: userData.displayName,
            photoURL: userData.photoURL
          };
          loadUserAvatarFromFirebase(tempUser, userAvatar);
        } else {
          // For non-Google avatars, preload for better performance
          const img = new Image();
          img.onload = () => {
            userAvatar.src = userData.photoURL;
            console.log('⚡ Cached avatar preloaded and updated');
          };
          img.onerror = () => {
            const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.displayName || userData.email)}&background=667eea&color=fff&size=64&rounded=true`;
            userAvatar.src = fallbackUrl;
            console.log('⚡ Cached avatar failed, using fallback');
          };
          img.src = userData.photoURL;
        }
      } else if (userAvatar && !userAvatar.src) {
        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.displayName || userData.email)}&background=667eea&color=fff&size=64&rounded=true`;
        userAvatar.src = fallbackUrl;
        console.log('⚡ No cached photo, using generated avatar');
      }
      
      console.log('⚡ Cached user menu state confirmed - Reddit-style instant display');
    }
  }
  
  // Fallback timeout for backup initialization (much shorter now)
  setTimeout(() => {
    if (typeof firebase !== 'undefined' && !window.firebaseAuth) {
      console.log('🔄 Fallback: Initializing Firebase...');
      initializeFirebaseBackup();
    }
  }, 500); // Reduced from 2000ms to 500ms
  
  // registerServiceWorker(); // DISABLED for instant updates
});

// Make functions globally available for onclick handlers
window.updateApp = updateApp;
window.dismissUpdate = dismissUpdate;

// Debug functions for avatar testing
window.clearAvatarCache = function() {
  const keys = Object.keys(localStorage).filter(key => 
    key.startsWith('avatar_cache_') || key.startsWith('avatar_google_rate_block_')
  );
  keys.forEach(key => localStorage.removeItem(key));
  console.log('🧹 Cleared avatar cache:', keys.length, 'items removed');
};

window.testAvatarLoad = function() {
  const user = auth.currentUser;
  if (user && user.photoURL) {
    console.log('🧪 Testing avatar load for:', user.email);
    console.log('🔗 Original photoURL:', user.photoURL);
    
    // Clear cache and reload
    window.clearAvatarCache();
    
    // Trigger avatar reload
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) {
      showUserMenuWithElements(user, document.getElementById('authButtons'), document.getElementById('userMenu'));
    }
  } else {
    console.log('❌ No user signed in or no photoURL');
  }
};

// Make notepad functions globally available
window.saveNote = saveNote;
window.clearNote = clearNote;
window.downloadNote = downloadNote;
window.loadFile = loadFile;
window.downloadFile = downloadFile;
window.deleteFile = deleteFile;

// Debug function for testing high score persistence
window.testHighScore = function() {
  console.log('🧪 Testing High Score System');
  console.log('📊 Current game high score:', snakeGameState.highScore);
  
  // Show all snake-related localStorage keys
  const snakeKeys = Object.keys(localStorage).filter(key => key.includes('snake'));
  console.log('🐍 Snake-related localStorage keys:', snakeKeys);
  snakeKeys.forEach(key => {
    console.log(`   ${key}: ${localStorage.getItem(key)}`);
  });
  
  // Test saving a high score
  const testScore = Math.floor(Math.random() * 100) + 50;
  console.log(`🧪 Testing save with score: ${testScore}`);
  saveUserHighScore(testScore);
  
  // Test loading the high score
  console.log('🧪 Testing load...');
  const loadedScore = getUserHighScore();
  console.log(`🧪 Loaded score: ${loadedScore}`);
  
  // Refresh the game state
  console.log('🧪 Testing refresh...');
  refreshUserHighScore();
  
  return {
    saved: testScore,
    loaded: loadedScore,
    current: snakeGameState.highScore
  };
};

// Debug function for testing avatar loading
window.testAvatar = function() {
  const auth = window.firebaseAuth;
  if (!auth || !auth.currentUser) {
    console.log('❌ No authenticated user to test avatar');
    return;
  }
  
  const user = auth.currentUser;
  const avatarUrl = user.photoURL;
  
  console.log('🧪 Testing Avatar System');
  console.log('👤 User:', user.email);
  console.log('🖼️ Original photoURL:', avatarUrl);
  
  if (avatarUrl && avatarUrl.includes('googleusercontent.com')) {
    // Test the improved avatar processing
    console.log('🔧 Testing improved Google avatar processing...');
    
    // Test original URL
    testImageUrl(avatarUrl).then(ok => {
      console.log(`✅ Original URL test: ${ok ? 'SUCCESS' : 'FAILED'}`);
    });
    
    // Test base URL without parameters
    const baseUrl = avatarUrl.split('?')[0].replace(/=s\d+(-c)?/gi, '');
    testImageUrl(baseUrl).then(ok => {
      console.log(`✅ Base URL test: ${ok ? 'SUCCESS' : 'FAILED'}`);
    });
    
    // Test common size variants
    const sizeParams = ['=s96-c', '=s128-c', '=s192-c', '=s256-c'];
    sizeParams.forEach(sizeParam => {
      const testUrl = baseUrl + sizeParam;
      testImageUrl(testUrl).then(ok => {
        console.log(`✅ ${sizeParam} test: ${ok ? 'SUCCESS' : 'FAILED'}`);
      });
    });
  }
  
  return { 
    originalUrl: avatarUrl,
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    }
  };
};

// Function to manually refresh avatar
window.refreshAvatar = function() {
  const auth = window.firebaseAuth;
  const userAvatar = document.getElementById('userAvatar');
  
  if (!auth || !auth.currentUser) {
    console.log('❌ No authenticated user to refresh avatar');
    return;
  }
  
  if (!userAvatar) {
    console.log('❌ User avatar element not found');
    return;
  }
  
  console.log('🔄 Manually refreshing avatar...');
  
  // Clear cache and reload
  localStorage.removeItem(avatarCacheKey(auth.currentUser.uid));
  loadUserAvatarFromFirebase(auth.currentUser, userAvatar);
  
  console.log('✅ Avatar refresh initiated');
};

// Debug function for testing notepad file operations
window.testNotepad = function() {
  console.log('🧪 Testing Notepad File System');
  
  // Show all notepad-related localStorage keys
  const notepadKeys = Object.keys(localStorage).filter(key => key.includes('notepad'));
  console.log('📝 Notepad-related localStorage keys:', notepadKeys);
  notepadKeys.forEach(key => {
    console.log(`   ${key}: ${localStorage.getItem(key)}`);
  });
  
  // Test save functionality
  const testContent = 'Test content for file operations';
  document.getElementById('notepadText').value = testContent;
  
  console.log('🧪 Testing save...');
  // This will be called manually since it requires user input
  
  // Show saved files
  const savedFiles = JSON.parse(localStorage.getItem('notepad_saved_files') || '[]');
  console.log('📄 Current saved files:', savedFiles);
  
  return {
    savedFilesCount: savedFiles.length,
    notepadKeys: notepadKeys
  };
};

// Service Worker Registration DISABLED for instant updates
// async function registerServiceWorker() {
//   if ('serviceWorker' in navigator) {
//     try {
//       const registration = await navigator.serviceWorker.register('/sw.js');
//       console.log('✅ Service Worker registered successfully:', registration.scope);
//       
//       // Handle service worker updates
//       registration.addEventListener('updatefound', () => {
//         const newWorker = registration.installing;
//         newWorker.addEventListener('statechange', () => {
//           if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
//             showNotification('🔄 App update available! Refresh to update.', 'info');
//           }
//         });
//       });
//       
//       // Check for updates periodically
//       setInterval(() => {
//         registration.update();
//       }, 60000); // Check every minute
//       
//     } catch (error) {
//       console.error('❌ Service Worker registration failed:', error);
//     }
//   } else {
//     console.log('⚠️ Service Workers not supported in this browser');
//   }

//   // Add PWA install prompt
//   setupPWAInstallPrompt();
// }

// PWA Install Prompt DISABLED
// function setupPWAInstallPrompt() {
//   let deferredPrompt;
  
//   window.addEventListener('beforeinstallprompt', (e) => {
//     console.log('💡 PWA install prompt available');
//     e.preventDefault();
//     deferredPrompt = e;
//   // window.addEventListener('beforeinstallprompt', (e) => {
//   //   console.log('💡 PWA install prompt available');
//   //   e.preventDefault();
//   //   deferredPrompt = e;
    
//   //   // Show custom install button
//   //   showPWAInstallButton(deferredPrompt);
//   // });
  
//   // window.addEventListener('appinstalled', () => {
//   //   console.log('🎉 PWA installed successfully');
//   //   showNotification('🎉 App installed! You can now use it offline.', 'success');
//   //   deferredPrompt = null;
//   // });
// }

// function showPWAInstallButton(deferredPrompt) {
//   // Create install button
//   const installBtn = document.createElement('button');
//   installBtn.className = 'btn btn-primary pwa-install-btn';
//   installBtn.innerHTML = '📱 Install App';
//   installBtn.style.cssText = `
//     position: fixed;
//     bottom: 20px;
//     right: 20px;
//     z-index: 9999;
//     animation: pulseGlow 2s infinite;
//     box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
//   `;
  
//   installBtn.onclick = async () => {
//     if (deferredPrompt) {
//       deferredPrompt.prompt();
//       const { outcome } = await deferredPrompt.userChoice;
//       console.log(`PWA install ${outcome}`);
      
//       if (outcome === 'accepted') {
//         installBtn.remove();
//       }
//       deferredPrompt = null;
//     }
//   };
  
//   document.body.appendChild(installBtn);
  
//   // Auto-hide after 30 seconds
//   setTimeout(() => {
//     if (installBtn.parentNode) {
//       installBtn.remove();
//     }
//   }, 30000);
// }

function initializeApp() {
  // iOS-specific fixes
  setupiOSFixes();
  
  // Setup admin panel (hidden feature)
  setupAdminPanel();
  
  setupModalHandlers();
  setupMobileMenu();
  setupFormHandlers();
  setupFormValidation();
  setupScrollEffects();
  setupThemeToggle();
  setupDynamicBackground();
  setupButtonShimmer();
  setupGamesNavigation();
  setupTicTacToe();
  setupMemoryGame();
  setupSnakeGame();
  setupBrandNavigation();
  setupVideoPlayer();
  setupCalculatorKeyboard();
  setupFloatingChatbot();
  
  // Apply IDM protection
  preventIDMDownload();
  
  // Fix form encoding attributes
  fixFormEncoding();
}

// Admin functionality (hidden feature - press Ctrl+Shift+U to access)
function setupAdminPanel() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'U') {
      showUserDatabase();
    }
  });
}

function showUserDatabase() {
  // Admin notifications disabled - function does nothing
  return;
}

// Additional utility functions for better UX
function clearFormErrors() {
  // Clear old style errors
  const errorElements = document.querySelectorAll('.field-error');
  errorElements.forEach(error => error.remove());
  
  // Clear new style errors
  const errorMessages = document.querySelectorAll('.error-message');
  errorMessages.forEach(error => {
    error.style.display = 'none';
    error.classList.remove('show');
  });
}

function showFieldError(fieldId, message) {
  // First try to find the new style error element
  const errorElement = document.getElementById(fieldId);
  if (errorElement && errorElement.classList.contains('error-message')) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    errorElement.classList.add('show');
    return;
  }
  
  // Fallback to old style for backward compatibility
  clearFormErrors();
  const field = document.getElementById(fieldId.replace('Error', ''));
  if (field) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.style.cssText = `
      color: #ff4757;
      font-size: 0.875rem;
      margin-top: 0.25rem;
      animation: fadeIn 0.3s ease;
    `;
    errorDiv.textContent = message;
    field.parentNode.appendChild(errorDiv);
    field.focus();
  }
}

// Enhanced form validation with real-time feedback
function setupFormValidation() {
  const emailInputs = document.querySelectorAll('input[type="email"]');
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  
  emailInputs.forEach(input => {
    input.addEventListener('blur', () => {
      if (input.value && !isValidEmail(input.value)) {
        showFieldError(input.id, 'Please enter a valid email address');
      } else {
        clearFormErrors();
      }
    });
  });
  
  passwordInputs.forEach(input => {
    if (input.id === 'signupPassword') {
      input.addEventListener('input', () => {
        if (input.value.length > 0) {
          const validation = validatePassword(input.value);
          if (!validation.valid) {
            showFieldError(input.id, validation.message);
          } else {
            clearFormErrors();
          }
        }
      });
    }
  });
}

// URL Routing and History Management
function setupRouting() {
  // Handle browser back/forward buttons
  window.addEventListener('popstate', handlePopState);
  
  // Handle navigation links
  setupNavigationLinks();
  
  // Load initial route
  handlePopState();
}

function handlePopState() {
  const hash = window.location.hash || '#home';
  navigateToSection(hash.substring(1), false); // Remove # and don't add to history
}

function setupNavigationLinks() {
  // Navigation menu links
  const navLinks = document.querySelectorAll('.nav-links a');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.getAttribute('href').substring(1); // Remove #
      navigateToSection(section, true);
    });
  });
}

function navigateToSection(section, addToHistory = true) {
  const heroSection = document.querySelector('.hero-section');
  const mainMenuSection = document.getElementById('mainMenuSection');
  const portfolioSection = document.getElementById('portfolioSection');
  const gamesSection = document.getElementById('gamesSection');
  const toolsSection = document.getElementById('toolsSection');
  const ticTacToeGame = document.getElementById('ticTacToeGame');
  const memoryGame = document.getElementById('memoryGame');
  const snakeGame = document.getElementById('snakeGame');
  const calculatorTool = document.getElementById('calculatorTool');
  const notepadTool = document.getElementById('notepadTool');
  const timerTool = document.getElementById('timerTool');
  const heroVideo = document.querySelector('.hero-video');
  
  // Pause video audio when leaving home tab
  if (section !== 'home' && section !== 'default') {
    pauseVideoAudio();
  }
  
  // Hide all sections first
  heroSection.style.display = 'none';
  mainMenuSection.style.display = 'none';
  portfolioSection.style.display = 'none';
  gamesSection.style.display = 'none';
  toolsSection.style.display = 'none';
  ticTacToeGame.style.display = 'none';
  memoryGame.style.display = 'none';
  snakeGame.style.display = 'none';
  calculatorTool.style.display = 'none';
  notepadTool.style.display = 'none';
  timerTool.style.display = 'none';
  
  // Hide video by default
  if (heroVideo) {
    heroVideo.style.display = 'none';
  }
  
  // Update URL and history
  if (addToHistory) {
    history.pushState({ section }, '', `#${section}`);
  }
  
  // Show appropriate section and create content
  switch (section) {
    case 'home':
      heroSection.style.display = 'block';
      // Show video only on home tab
      if (heroVideo) {
        heroVideo.style.display = 'block';
      }
      // Sync video state when returning to home
      syncVideoStateOnReturn();
      updateHeroContent('home');
      break;
    case 'features':
      heroSection.style.display = 'block';
      updateHeroContent('features');
      break;
    case 'about':
      heroSection.style.display = 'block';
      updateHeroContent('about');
      break;
    case 'contact':
      heroSection.style.display = 'block';
      updateHeroContent('contact');
      break;
    case 'mainmenu':
      mainMenuSection.style.display = 'block';
      break;
    case 'portfolio':
      portfolioSection.style.display = 'block';
      break;
    case 'tools':
      toolsSection.style.display = 'block';
      break;
    case 'calculator':
      calculatorTool.style.display = 'block';
      initializeCalculator();
      break;
    case 'notepad':
      notepadTool.style.display = 'block';
      loadNotepadContent();
      break;
    case 'timer':
      timerTool.style.display = 'block';
      initializeTimer();
      break;
    case 'games':
      gamesSection.style.display = 'block';
      break;
    case 'tic-tac-toe':
      ticTacToeGame.style.display = 'block';
      resetTicTacToeGame();
      break;
    case 'memory-game':
      memoryGame.style.display = 'block';
      resetMemoryGame();
      break;
    case 'snake-game':
      snakeGame.style.display = 'block';
      resetSnakeGame();
      break;
    default:
      heroSection.style.display = 'block';
      // Show video for default (home) case too
      if (heroVideo) {
        heroVideo.style.display = 'block';
      }
      updateHeroContent('home');
  }
  
  // Update active nav link
  updateActiveNavLink(section);
}

function updateHeroContent(section) {
  const heroTitle = document.querySelector('.hero-section h2');
  const heroText = document.querySelector('.hero-section p');
  const getStartedBtn = document.getElementById('getStartedBtn');
  const portfolioBtn = document.getElementById('portfolioBtn');
  const emojiBtn = document.getElementById('emojiBtn');
  
  const content = {
    home: {
      title: "Welcome to Sahil's Web",
      text: "Experience the future of web applications with our sleek and modern interface.",
      showGamesButton: true
    },
    features: {
      title: "Amazing Features",
      text: "Discover powerful tools and capabilities designed to enhance your experience with cutting-edge technology.",
      showGamesButton: false
    },
    about: {
      title: "About Sahil's Web",
      text: `👋 Hi, I'm Sahil!<br>
      <br>
      <span style="font-size:1.2em;">💻 I love <strong>technology</strong>, <strong>coding</strong>, and exploring <strong>science</strong>!<br>
      🏀 I'm also passionate about <strong>basketball</strong>.<br></span>
      <br>
      This website is designed to bring you <strong>fun games</strong> 🎮 and <strong>useful tools</strong> 🛠️ for your everyday needs.<br>
      <br>
      <span style="color:var(--primary-color);font-weight:500;">Our mission:</span> <br>
      <span style="font-size:1.1em;">To create beautiful, functional, and user-friendly web experiences that inspire curiosity and creativity.</span><br>
      <br>
      <span style="font-size:1.2em;">✨ Explore, play, and enjoy!</span>`,
      showGamesButton: false
    },
    contact: {
      title: "Get In Touch",
      text: "Ready to start your journey? Contact us today and let's build something amazing together.",
      showGamesButton: false
    }
  };
  
  const sectionContent = content[section] || content.home;
  
  heroTitle.textContent = sectionContent.title;
  heroText.innerHTML = sectionContent.text;
  
  // Show/hide buttons based on section
  if (sectionContent.showGamesButton) {
    getStartedBtn.style.display = 'inline-flex';
    getStartedBtn.textContent = 'Get Started';
    portfolioBtn.style.display = 'inline-flex';
    portfolioBtn.textContent = 'Portfolio';
    emojiBtn.style.display = 'none';
  } else {
    getStartedBtn.style.display = 'inline-flex';
    getStartedBtn.textContent = section === 'contact' ? 'Contact Us' : section === 'features' ? 'Go Back to Home' : 'View Portfolio';
    
    // Show Portfolio button only on home page, show emoji button only on features page
    if (section === 'home') {
      portfolioBtn.style.display = 'inline-flex';
      portfolioBtn.textContent = 'Portfolio';
      emojiBtn.style.display = 'none';
    } else if (section === 'features') {
      portfolioBtn.style.display = 'none';
      emojiBtn.style.display = 'inline-flex';
    } else {
      portfolioBtn.style.display = 'none';
      emojiBtn.style.display = 'none';
    }
  }
}

function updateActiveNavLink(section) {
  const navLinks = document.querySelectorAll('.nav-links a');
  navLinks.forEach(link => {
    const linkSection = link.getAttribute('href').substring(1);
    if (linkSection === section) {
      link.style.color = 'var(--primary-color)';
    } else {
      link.style.color = '';
    }
  });
}

// Modal Management - Global functions
function openModal(modal) {
  if (!modal) {
    console.error('❌ Modal element not found');
    return;
  }
  
  const modalOverlay = document.getElementById('modalOverlay');
  if (!modalOverlay) {
    console.error('❌ Modal overlay not found');
    return;
  }
  
  console.log('🔓 Opening modal:', modal.id);
  
  modal.style.display = 'flex';
  modalOverlay.style.display = 'block';
  setTimeout(() => {
    modal.classList.add('active');
    modalOverlay.classList.add('active');
  }, 10);
  document.body.style.overflow = 'hidden';
  
  // Focus first input
  const firstInput = modal.querySelector('input');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 300);
  }
}

function closeModal(modal) {
  if (!modal) return;
  
  const modalOverlay = document.getElementById('modalOverlay');
  console.log('🔒 Closing modal:', modal.id);
  
  modal.classList.remove('active');
  if (modalOverlay) {
    modalOverlay.classList.remove('active');
  }
  
  setTimeout(() => {
    modal.style.display = 'none';
    if (!document.querySelector('.modal.active') && modalOverlay) {
      modalOverlay.style.display = 'none';
      document.body.style.overflow = '';
    }
  }, 300);
  clearFormErrors();
}

function closeAllModals() {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => closeModal(modal));
}

function setupModalHandlers() {
  console.log('Modal handlers initialized');
}

// Mobile Menu
function setupMobileMenu() {
  const mobileToggle = document.getElementById('mobileToggle');
  const mobileSlideMenu = document.getElementById('mobileSlideMenu');
  const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  const mobileMenuClose = document.getElementById('mobileMenuClose');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');

  // Open mobile menu
  function openMobileMenu() {
    mobileSlideMenu.classList.add('active');
    mobileMenuOverlay.classList.add('active');
    mobileToggle.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // Close mobile menu
  function closeMobileMenu() {
    mobileSlideMenu.classList.remove('active');
    mobileMenuOverlay.classList.remove('active');
    mobileToggle.classList.remove('active');
    document.body.style.overflow = 'auto';
  }

  // Expose closeMobileMenu globally
  globalCloseMobileMenu = closeMobileMenu;
  
  console.log('🔧 Global closeMobileMenu function set:', !!globalCloseMobileMenu);

  // Event listeners
  mobileToggle.addEventListener('click', openMobileMenu);
  mobileMenuClose.addEventListener('click', closeMobileMenu);
  mobileMenuOverlay.addEventListener('click', closeMobileMenu);

  // Close menu with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileSlideMenu.classList.contains('active')) {
      closeMobileMenu();
    }
  });

  // Close menu when clicking nav links
  mobileNavLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      closeMobileMenu();
      // Handle navigation
      const href = e.target.getAttribute('href');
      if (href.startsWith('#')) {
        e.preventDefault();
        const section = href.substring(1);
        navigateToSection(section, true);
      }
    });
  });

  // Set up mobile theme toggle
  const mobileThemeToggle = document.getElementById('mobileThemeToggle');
  if (mobileThemeToggle) {
    mobileThemeToggle.addEventListener('click', () => {
      const themeToggle = document.getElementById('themeToggle');
      themeToggle.click(); // Trigger the main theme toggle
    });
    
    // Sync theme icon
    const syncThemeIcons = () => {
      const mainIcon = document.querySelector('#themeToggle .theme-icon');
      const mobileIcon = document.querySelector('#mobileThemeToggle .theme-icon');
      if (mainIcon && mobileIcon) {
        mobileIcon.textContent = mainIcon.textContent;
      }
    };
    
    // Initial sync and observe changes
    syncThemeIcons();
    const observer = new MutationObserver(syncThemeIcons);
    const mainIcon = document.querySelector('#themeToggle .theme-icon');
    if (mainIcon) {
      observer.observe(mainIcon, { childList: true, characterData: true, subtree: true });
    }
  }
}

// Authentication System
function setupAuthentication() {
  const isProduction = window.location.hostname !== 'localhost';
  const currentDomain = window.location.hostname;
  
  console.log(`🔐 Setting up authentication for ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}: ${currentDomain}`);
  
  const auth = window.firebaseAuth;
  const googleProvider = window.googleProvider;
  
  // Enhanced error checking for production
  if (!auth || !googleProvider) {
    console.error('❌ Firebase not properly initialized!');
    if (isProduction) {
      console.error('🚨 PRODUCTION ERROR: Firebase auth not available');
      showNotification('Authentication service unavailable. Please refresh the page.', 'error');
    }
    return;
  }
  
  console.log('✅ Firebase auth objects found:', { auth: !!auth, provider: !!googleProvider });
  
  // Get DOM elements with enhanced checking
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const authButtons = document.getElementById('authButtons');
  const userMenu = document.getElementById('userMenu');
  
  // Modal elements
  const loginModal = document.getElementById('loginModal');
  const signupModal = document.getElementById('signupModal');
  const modalOverlay = document.getElementById('modalOverlay');
  const loginModalClose = document.getElementById('loginModalClose');
  const signupModalClose = document.getElementById('signupModalClose');
  
  // Set global references for mobile access
  globalLoginModal = loginModal;
  globalSignupModal = signupModal;
  globalModalOverlay = modalOverlay;
  
  console.log('🔧 Global modal references set:', {
    globalLoginModal: !!globalLoginModal,
    globalSignupModal: !!globalSignupModal,
    globalModalOverlay: !!globalModalOverlay
  });
  
  // Form elements
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const googleSignupBtn = document.getElementById('googleSignupBtn');
  
  // Check if critical elements exist
  const missingElements = [];
  if (!loginBtn) missingElements.push('loginBtn');
  if (!signupBtn) missingElements.push('signupBtn');
  if (!loginModal) missingElements.push('loginModal');
  if (!signupModal) missingElements.push('signupModal');
  if (!modalOverlay) missingElements.push('modalOverlay');
  
  if (missingElements.length > 0) {
    console.error('❌ Missing critical authentication elements:', missingElements);
    if (isProduction) {
      console.error('🚨 PRODUCTION ERROR: Missing DOM elements for authentication');
    }
    return;
  }
  
  console.log('✅ All authentication DOM elements found');
  
  // Set Firebase persistence to LOCAL to maintain auth state across browser sessions
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
      console.log('✅ Firebase persistence set to LOCAL - user will stay logged in across sessions');
      if (isProduction) {
        console.log('🌐 PRODUCTION: Auth persistence configured for domain:', currentDomain);
      }
      
      // Initialize auth state restored flag - wait for auth state to be determined
      // Don't set this immediately, let the auth state listener handle it
      console.log('🔄 Waiting for Firebase to determine initial auth state...');
    })
    .catch((error) => {
      console.error('❌ Error setting Firebase persistence:', error);
      if (isProduction) {
        console.error('🚨 PRODUCTION ERROR: Failed to set auth persistence on domain:', currentDomain);
      }
      // Fallback notification
      showNotification('Authentication setup incomplete. Please refresh the page.', 'warning');
    });
  
  // Handle redirect result for Google Sign-In (when popup auth fails)
  auth.getRedirectResult().then((result) => {
    if (result && result.user) {
      console.log('✅ Redirect authentication successful:', result.user.email);
      // The onAuthStateChanged listener will handle the UI updates
    }
  }).catch((error) => {
    if (error.code !== 'auth/operation-not-allowed') {
      console.error('❌ Redirect authentication error:', error);
    }
  });
  
  // Optimized auth state listener for instant UI updates
  auth.onAuthStateChanged((user) => {
    console.log('🔥 Auth state changed:', user ? `User logged in: ${user.email}` : 'User logged out');
    console.log('🔧 Auth state change details:', {
      user: user ? { email: user.email, uid: user.uid } : null,
      timestamp: new Date().toISOString(),
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n')
    });
    
    if (isProduction) {
      console.log('🌐 PRODUCTION Auth state change on domain:', currentDomain, user ? 'LOGGED IN' : 'LOGGED OUT');
    }
    
    // Get DOM elements (they should be available by now)
    const currentAuthButtons = document.getElementById('authButtons');
    const currentUserMenu = document.getElementById('userMenu');
    
    if (user) {
      // User is signed in - cache user data for instant display on next load
      const userCache = {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        uid: user.uid,
        emailVerified: user.emailVerified
      };
      localStorage.setItem('firebase_cached_user', JSON.stringify(userCache));
      
      console.log('✅ User authenticated and cached:', {
        email: user.email,
        displayName: user.displayName,
        uid: user.uid,
        emailVerified: user.emailVerified
      });
      
      // Show user menu immediately if DOM elements are available
      if (currentAuthButtons && currentUserMenu) {
        showUserMenuWithElements(user, currentAuthButtons, currentUserMenu);
        closeAllModals();
        
        // Refresh high score for the logged-in user
        refreshUserHighScore();
        
        // Handle welcome notification for fresh logins only
        if (window.authStateRestored === false) {
          // Fresh login (user was logged out and just logged in)
          showNotification(`Welcome back, ${user.displayName || user.email}! 👋`, 'success');
        } else if (window.authStateRestored === undefined) {
          // First time auth state determination - silent restoration
          console.log('⚡ Auth state restored from persistence instantly');
        }
        window.authStateRestored = true;
      } else {
        // Minimal retry for edge cases where DOM isn't ready yet
        console.warn('⚠️ DOM elements not ready, single retry...');
        requestAnimationFrame(() => {
          const retryAuthButtons = document.getElementById('authButtons');
          const retryUserMenu = document.getElementById('userMenu');
          if (retryAuthButtons && retryUserMenu) {
            showUserMenuWithElements(user, retryAuthButtons, retryUserMenu);
            closeAllModals();
            
            // Refresh high score for the logged-in user (retry path)
            refreshUserHighScore();
          } else {
            console.error('❌ DOM elements still not found after retry');
          }
        });
      }
    } else {
      // User is signed out - remove cached data
      localStorage.removeItem('firebase_cached_user');
      console.log('ℹ️ User not authenticated, cache cleared');
      
      // Refresh high score for anonymous user
      refreshUserHighScore();
      
      if (currentAuthButtons && currentUserMenu) {
        showAuthButtonsWithElements(currentAuthButtons, currentUserMenu);
      }
      window.authStateRestored = false;
    }
  });
  
  // Event listeners with enhanced error handling
  loginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('🔑 Login button clicked');
    
    if (isProduction) {
      console.log('🌐 PRODUCTION: Opening login modal on domain:', currentDomain);
    }
    
    openModal(loginModal);
  });
  
  signupBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('📝 Signup button clicked');
    
    if (isProduction) {
      console.log('🌐 PRODUCTION: Opening signup modal on domain:', currentDomain);
    }
    
    openModal(signupModal);
  });
  
  logoutBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('👋 Logout button clicked');
    console.log('🔧 Logout button element:', logoutBtn);
    console.log('🔧 Event details:', { type: e.type, target: e.target.id });
    handleLogout();
  });

  // Mobile auth button event listeners
  const mobileLoginBtn = document.getElementById('mobileLoginBtn');
  const mobileSignupBtn = document.getElementById('mobileSignupBtn');
  const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');

  console.log('🔧 Mobile auth button elements found:', {
    mobileLoginBtn: !!mobileLoginBtn,
    mobileSignupBtn: !!mobileSignupBtn,
    mobileLogoutBtn: !!mobileLogoutBtn
  });

  mobileLoginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('🔑 Mobile login button clicked');
    console.log('🔧 Global functions available:', {
      globalCloseMobileMenu: !!globalCloseMobileMenu,
      globalOpenModal: !!globalOpenModal,
      globalLoginModal: !!globalLoginModal
    });
    
    if (isProduction) {
      console.log('🌐 PRODUCTION: Opening mobile login modal on domain:', currentDomain);
    }
    
    // Close mobile menu first
    if (globalCloseMobileMenu) {
      globalCloseMobileMenu();
    }
    
    // Open login modal using global reference
    if (globalOpenModal && globalLoginModal) {
      globalOpenModal(globalLoginModal);
    } else {
      console.error('❌ Global modal references not available');
    }
  });

  mobileSignupBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('📝 Mobile signup button clicked');
    console.log('🔧 Global functions available:', {
      globalCloseMobileMenu: !!globalCloseMobileMenu,
      globalOpenModal: !!globalOpenModal,
      globalSignupModal: !!globalSignupModal
    });
    
    if (isProduction) {
      console.log('🌐 PRODUCTION: Opening mobile signup modal on domain:', currentDomain);
    }
    
    // Close mobile menu first
    if (globalCloseMobileMenu) {
      globalCloseMobileMenu();
    }
    
    // Open signup modal using global reference
    if (globalOpenModal && globalSignupModal) {
      globalOpenModal(globalSignupModal);
    } else {
      console.error('❌ Global modal references not available');
    }
  });

  mobileLogoutBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('👋 Mobile logout button clicked');
    console.log('🔧 Mobile logout button element:', mobileLogoutBtn);
    console.log('🔧 Event details:', { type: e.type, target: e.target.id });
    
    // Close mobile menu first
    if (globalCloseMobileMenu) {
      globalCloseMobileMenu();
    }
    handleLogout();
  });
  
  // Modal close handlers
  loginModalClose?.addEventListener('click', () => closeModal(loginModal));
  signupModalClose?.addEventListener('click', () => closeModal(signupModal));
  modalOverlay?.addEventListener('click', closeAllModals);
  
  // Form submission handlers
  loginForm?.addEventListener('submit', handleEmailLogin);
  signupForm?.addEventListener('submit', handleEmailSignup);
  
  // Google auth handlers with enhanced debugging
  googleLoginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('🔑 Google login attempted');
    
    if (isProduction) {
      console.log('🌐 PRODUCTION: Google login on domain:', currentDomain);
      console.log('🔧 Firebase auth state:', !!auth);
      console.log('🔧 Google provider state:', !!googleProvider);
    }
    
    handleGoogleAuth(e);
  });
  
  googleSignupBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('📝 Google signup attempted');
    
    if (isProduction) {
      console.log('🌐 PRODUCTION: Google signup on domain:', currentDomain);
      console.log('🔧 Firebase auth state:', !!auth);
      console.log('🔧 Google provider state:', !!googleProvider);
    }
    
    handleGoogleAuth(e);
  });
  
  // Auth switch handlers
  document.getElementById('showSignupFromLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal(loginModal);
    openModal(signupModal);
  });
  
  document.getElementById('showLoginFromSignup')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal(signupModal);
    openModal(loginModal);
  });
  
  // Forgot password handler
  document.getElementById('forgotPasswordLink')?.addEventListener('click', handleForgotPassword);
  
  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
  
  function showUserMenu(user) {
    console.log('👤 Showing user menu for:', user.email);
    
    if (!authButtons || !userMenu) {
      console.error('❌ Missing authButtons or userMenu elements');
      return;
    }
    
    showUserMenuWithElements(user, authButtons, userMenu);
  }
  
  function showUserMenuWithElements(user, authButtonsEl, userMenuEl) {
    authButtonsEl.style.display = 'none';
    userMenuEl.style.display = 'flex';
    
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    
    // Also handle mobile elements
    const mobileAuthButtons = document.getElementById('mobileAuthButtons');
    const mobileUserMenu = document.getElementById('mobileUserMenu');
    const mobileUserAvatar = document.getElementById('mobileUserAvatar');
    const mobileUserName = document.getElementById('mobileUserName');
    
    if (mobileAuthButtons) mobileAuthButtons.style.display = 'none';
    if (mobileUserMenu) mobileUserMenu.style.display = 'flex';
    
    // Add Electron update button if in Electron environment
    if (window.electronAPI) {
      setTimeout(() => addElectronUpdateButton(), 100);
    }
    
    if (userAvatar) {
      console.log('🖼️ Setting up Firebase-based avatar system for user:', user.uid);
      
      // Firebase-based avatar loading with fallback
      loadUserAvatarFromFirebase(user, userAvatar);
    } else {
      console.warn('⚠️ User avatar element not found');
    }
    
    // Update mobile avatar too
    if (mobileUserAvatar) {
      loadUserAvatarFromFirebase(user, mobileUserAvatar);
    }
    
    if (userName) {
      userName.textContent = user.displayName || user.email.split('@')[0];
      console.log('📝 User name updated:', userName.textContent);
    } else {
      console.warn('⚠️ User name element not found');
    }
    
    // Update mobile user name too
    if (mobileUserName) {
      mobileUserName.textContent = user.displayName || user.email.split('@')[0];
    }
    
    console.log('✅ User menu displayed successfully');
  }
  
  function showAuthButtons() {
    console.log('🔑 Showing auth buttons');
    
    if (!authButtons || !userMenu) {
      console.error('❌ Missing authButtons or userMenu elements');
      return;
    }
    
    showAuthButtonsWithElements(authButtons, userMenu);
  }
  
  function showAuthButtonsWithElements(authButtonsEl, userMenuEl) {
    console.log('🔧 Showing auth buttons...');
    console.log('🔧 Auth buttons element:', !!authButtonsEl);
    console.log('🔧 User menu element:', !!userMenuEl);
    
    if (authButtonsEl) {
      authButtonsEl.style.display = 'flex';
      console.log('✅ Auth buttons display set to flex');
    } else {
      console.error('❌ Auth buttons element not found');
    }
    
    if (userMenuEl) {
      userMenuEl.style.display = 'none';
      console.log('✅ User menu display set to none');
    } else {
      console.error('❌ User menu element not found');
    }
    
    // Also handle mobile elements
    const mobileAuthButtons = document.getElementById('mobileAuthButtons');
    const mobileUserMenu = document.getElementById('mobileUserMenu');
    
    if (mobileAuthButtons) {
      mobileAuthButtons.style.display = 'flex';
      console.log('✅ Mobile auth buttons display set to flex');
    }
    
    if (mobileUserMenu) {
      mobileUserMenu.style.display = 'none';
      console.log('✅ Mobile user menu display set to none');
    }
    
    console.log('✅ Auth buttons displayed successfully');
  }
  
  function openModal(modal) {
    modal.style.display = 'flex';
    modalOverlay.style.display = 'block';
    setTimeout(() => {
      modal.classList.add('active');
      modalOverlay.classList.add('active');
    }, 10);
    document.body.style.overflow = 'hidden';
    
    // Focus first input
    const firstInput = modal.querySelector('input');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 300);
    }
  }
  
  // Expose openModal globally
  globalOpenModal = openModal;
  
  console.log('🔧 Global openModal function set:', !!globalOpenModal);
  
  function closeModal(modal) {
    modal.classList.remove('active');
    modalOverlay.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
      if (!document.querySelector('.modal.active')) {
        modalOverlay.style.display = 'none';
        document.body.style.overflow = '';
      }
    }, 300);
    clearFormErrors();
  }
  
  
  async function handleEmailLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (!validateLoginForm(email, password)) return;
    
    setButtonLoading(submitBtn, true);
    
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      console.error('Login error:', error);
      handleAuthError(error, 'login');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }
  
  async function handleEmailSignup(e) {
    e.preventDefault();
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (!validateSignupForm(name, email, password, confirmPassword)) return;
    
    setButtonLoading(submitBtn, true);
    
    try {
      const result = await auth.createUserWithEmailAndPassword(email, password);
      
      // Update user profile with name
      if (name) {
        await result.user.updateProfile({
          displayName: name
        });
      }
      
      showNotification('Account created successfully! 🎉', 'success');
    } catch (error) {
      console.error('Signup error:', error);
      handleAuthError(error, 'signup');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }
  
  async function handleGoogleAuth() {
    console.log('🔍 Initiating Google authentication...');
    
    if (isProduction) {
      console.log('🌐 PRODUCTION: Google auth on domain:', currentDomain);
      console.log('🔧 Auth object available:', !!auth);
      console.log('🔧 Google provider available:', !!googleProvider);
    }
    
    try {
      // Try popup auth first, fallback to redirect if popup fails due to COOP/CSP
      let result;
      try {
        console.log('🔐 Attempting popup authentication...');
        // Use signInWithPopup for better UX
        result = await auth.signInWithPopup(googleProvider);
        console.log('✅ Popup authentication successful');
      } catch (popupError) {
        console.warn('⚠️ Popup auth failed:', popupError.message);
        
        // Check if it's a popup-related error or COOP/CSP issue
        if (popupError.code === 'auth/popup-blocked' || 
            popupError.code === 'auth/popup-closed-by-user' ||
            popupError.code === 'auth/cancelled-popup-request' ||
            popupError.message.includes('popup') ||
            popupError.message.includes('Cross-Origin-Opener-Policy') ||
            popupError.message.includes('window.closed')) {
          
          console.log('🔄 Popup blocked or COOP issue, switching to redirect authentication');
          
          // Show loading state before redirect
          showNotification('Redirecting to Google Sign-In...', 'info');
          
          // Small delay to show the notification
          setTimeout(async () => {
            try {
              await auth.signInWithRedirect(googleProvider);
            } catch (redirectError) {
              console.error('❌ Redirect authentication also failed:', redirectError);
              showNotification('Authentication failed. Please try again.', 'error');
            }
          }, 500);
          
          return; // Exit early as redirect will handle the rest
        } else {
          throw popupError; // Re-throw if it's not popup-related
        }
      }
      
      const user = result.user;
      
      console.log('✅ Google authentication successful:', {
        email: user.email,
        displayName: user.displayName,
        uid: user.uid
      });
      
      if (isProduction) {
        console.log('🌐 PRODUCTION: Google auth successful on domain:', currentDomain);
        console.log('🔧 User UID:', user.uid);
        console.log('🔧 User provider data:', user.providerData);
      }
      
      // The auth state will be automatically persisted by Firebase
      showNotification(`Welcome, ${user.displayName || user.email}! 🎉`, 'success');
      
      // Close any open modals after successful login
      closeAllModals();
      
      // Debug user info including photo URL
      console.log('👤 User profile info:', {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
        providerData: user.providerData
      });
      
    } catch (error) {
      console.error('❌ Google authentication error:', error);
      
      if (isProduction) {
        console.error('🚨 PRODUCTION: Google auth error on domain:', currentDomain);
        console.error('🚨 Error code:', error.code);
        console.error('🚨 Error message:', error.message);
      }
      
      // Handle specific error cases
      let errorMessage = 'Google sign-in failed. Please try again.';
      
      switch (error.code) {
        case 'auth/popup-closed-by-user':
          console.log('ℹ️ User closed the popup');
          return; // Don't show error for user-cancelled action
          
        case 'auth/popup-blocked':
          errorMessage = 'Popup blocked by browser. Please allow popups and try again.';
          console.error('🚨 Popup blocked - user needs to allow popups');
          break;
          
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your internet connection.';
          break;
          
        case 'auth/unauthorized-domain':
          errorMessage = 'This domain is not authorized for authentication. Please contact support.';
          if (isProduction) {
            console.error('🚨 CRITICAL: Unauthorized domain in production:', currentDomain);
          }
          break;
          
        case 'auth/operation-not-supported-in-this-environment':
          errorMessage = 'Authentication not supported in this environment.';
          break;
          
        default:
          console.error('🔍 Unhandled auth error code:', error.code);
      }
      
      showNotification(errorMessage, 'error');
    }
  }
  
  async function handleLogout() {
    try {
      console.log('🔄 Starting logout process...');
      console.log('🔧 Auth object state:', !!auth);
      console.log('🔧 Current user before logout:', auth?.currentUser?.email);
      
      if (!auth) {
        console.error('❌ Auth object is null or undefined');
        showNotification('Authentication service not available. Please refresh the page.', 'error');
        return;
      }
      
      await auth.signOut();
      console.log('✅ Firebase signOut completed successfully');
      showNotification('Successfully logged out! 👋', 'info');
    } catch (error) {
      console.error('❌ Logout error:', error);
      console.error('❌ Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      showNotification('Error logging out. Please try again.', 'error');
    }
  }
  
  async function handleForgotPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    
    if (!email) {
      showFieldError('loginEmailError', 'Please enter your email address first');
      return;
    }
    
    try {
      await auth.sendPasswordResetEmail(email);
      showNotification('Password reset email sent! Check your inbox. 📧', 'success');
      closeModal(loginModal);
    } catch (error) {
      console.error('Password reset error:', error);
      showNotification('Error sending password reset email. Please try again.', 'error');
    }
  }
  
  function validateLoginForm(email, password) {
    clearFormErrors();
    let isValid = true;
    
    if (!email) {
      showFieldError('loginEmailError', 'Email is required');
      isValid = false;
    } else if (!isValidEmail(email)) {
      showFieldError('loginEmailError', 'Please enter a valid email address');
      isValid = false;
    }
    
    if (!password) {
      showFieldError('loginPasswordError', 'Password is required');
      isValid = false;
    }
    
    return isValid;
  }
  
  function validateSignupForm(name, email, password, confirmPassword) {
    clearFormErrors();
    let isValid = true;
    
    if (!name) {
      showFieldError('signupNameError', 'Name is required');
      isValid = false;
    }
    
    if (!email) {
      showFieldError('signupEmailError', 'Email is required');
      isValid = false;
    } else if (!isValidEmail(email)) {
      showFieldError('signupEmailError', 'Please enter a valid email address');
      isValid = false;
    }
    
    if (!password) {
      showFieldError('signupPasswordError', 'Password is required');
      isValid = false;
    } else if (password.length < 6) {
      showFieldError('signupPasswordError', 'Password must be at least 6 characters long');
      isValid = false;
    }
    
    if (password !== confirmPassword) {
      showFieldError('confirmPasswordError', 'Passwords do not match');
      isValid = false;
    }
    
    return isValid;
  }
  
  function handleAuthError(error, context) {
    let message = 'An error occurred. Please try again.';
    
    switch (error.code) {
      case 'auth/user-not-found':
        message = 'No account found with this email address.';
        break;
      case 'auth/wrong-password':
        message = 'Incorrect password.';
        break;
      case 'auth/email-already-in-use':
        message = 'An account with this email already exists.';
        break;
      case 'auth/weak-password':
        message = 'Password is too weak. Please choose a stronger password.';
        break;
      case 'auth/invalid-email':
        message = 'Please enter a valid email address.';
        break;
      case 'auth/too-many-requests':
        message = 'Too many failed attempts. Please try again later.';
        break;
      default:
        message = error.message || message;
    }
    
    showNotification(message, 'error');
  }
  
  function setButtonLoading(button, loading) {
    if (loading) {
      button.disabled = true;
      button.querySelector('.btn-text').style.display = 'none';
      button.querySelector('.btn-loading').style.display = 'inline-flex';
    } else {
      button.disabled = false;
      button.querySelector('.btn-text').style.display = 'inline-flex';
      button.querySelector('.btn-loading').style.display = 'none';
    }
  }
  
  // Check current authentication state on page load for persistence verification
  const currentUser = auth.currentUser;
  if (currentUser) {
    console.log('🔄 Auth state restored from persistence:', {
      email: currentUser.email,
      displayName: currentUser.displayName,
      uid: currentUser.uid
    });
    
    if (isProduction) {
      console.log('🌐 PRODUCTION: Auth restored on domain:', currentDomain);
    }
  } else {
    console.log('ℹ️ No authenticated user found on page load');
    
    if (isProduction) {
      console.log('🌐 PRODUCTION: No auth state on domain:', currentDomain);
    }
  }
  
  console.log('🔐 Authentication setup completed successfully with persistence enabled');
  
  if (isProduction) {
    console.log('🌐 PRODUCTION: Authentication fully configured on domain:', currentDomain);
  }
}

// Form Handlers (Authentication integrated)
function setupFormHandlers() {
  // Authentication handled by setupAuthentication()
  console.log('Form handlers initialized with authentication');
}

// Authentication removed - no login functionality

// Authentication removed - no login functionality

// No auth initialization needed

// Utility Functions (kept for backwards compatibility)
function simulateApiCall() {
  return new Promise(resolve => setTimeout(resolve, 1500));
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Authentication functions removed

function showNotification(message, type = 'info') {
  // Simple console notification for Google Auth feedback
  const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  console.log(`${prefix} ${message}`);
  
  // Also show a simple alert for important messages
  if (type === 'error') {
    alert(`Error: ${message}`);
  } else if (type === 'success') {
    // Optional: You can add a toast notification system here later
    console.log(`Success: ${message}`);
  }
}

// Scroll Effects
function setupScrollEffects() {
  const header = document.querySelector('.app-header');
  let lastScrollY = window.scrollY;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    if (currentScrollY > 50) {
      header.style.background = isDark ? 'rgba(26, 32, 44, 0.98)' : 'rgba(255, 255, 255, 0.98)';
      header.style.backdropFilter = 'blur(20px)';
    } else {
      header.style.background = isDark ? 'rgba(26, 32, 44, 0.95)' : 'rgba(255, 255, 255, 0.95)';
      header.style.backdropFilter = 'blur(10px)';
    }

    lastScrollY = currentScrollY;
  });
}

// Dark Reader Support - Prevent extension from applying dark mode when app is in dark mode
function setDarkReaderLock(enabled) {
  let meta = document.querySelector('meta[name="darkreader-lock"]');
  if (enabled) {
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'darkreader-lock';
      document.head.appendChild(meta);
      console.log('Dark Reader lock enabled - extension dark mode disabled');
    }
  } else {
    if (meta) {
      meta.remove();
      console.log('Dark Reader lock removed - extension can apply dark mode');
    }
  }
}

// IDM Protection - Prevent Internet Download Manager from showing download toolbar
function preventIDMDownload() {
  // Add meta tag to disable IDM integration
  let idmMeta = document.querySelector('meta[name="no-idm"]');
  if (!idmMeta) {
    idmMeta = document.createElement('meta');
    idmMeta.name = 'no-idm';
    idmMeta.content = '1';
    document.head.appendChild(idmMeta);
  }
  
  // Disable IDM on video elements
  const videos = document.querySelectorAll('video, iframe[src*="vimeo"], iframe[src*="youtube"]');
  videos.forEach(video => {
    // Add IDM disable attributes
    video.setAttribute('controlsList', 'nodownload');
    video.setAttribute('disablePictureInPicture', 'true');
    video.setAttribute('data-no-idm', '1');
    
    // Prevent right-click context menu that might show IDM options
    video.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    });
  });
  
  // Override IDM detection methods if they exist
  if (window.IDMObject || window.IDM) {
    try {
      if (window.IDMObject) window.IDMObject = null;
      if (window.IDM) window.IDM = null;
      console.log('IDM object disabled');
    } catch (e) {
      console.log('IDM protection applied');
    }
  }
  
  console.log('IDM download prevention applied');
}

// Form Encoding Fix - Ensure all forms have proper enctype attribute
function fixFormEncoding() {
  const forms = document.querySelectorAll('form');
  let fixedCount = 0;
  
  forms.forEach(form => {
    // If form doesn't have enctype attribute, set it explicitly
    if (!form.hasAttribute('enctype')) {
      // Check if form has file inputs to determine appropriate enctype
      const hasFileInput = form.querySelector('input[type="file"]');
      if (hasFileInput) {
        form.setAttribute('enctype', 'multipart/form-data');
      } else {
        form.setAttribute('enctype', 'application/x-www-form-urlencoded');
      }
      fixedCount++;
    }
  });
  
  // Also fix any forms that might be added dynamically
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node is a form
            if (node.tagName === 'FORM' && !node.hasAttribute('enctype')) {
              const hasFileInput = node.querySelector('input[type="file"]');
              node.setAttribute('enctype', hasFileInput ? 'multipart/form-data' : 'application/x-www-form-urlencoded');
            }
            // Check for forms within the added node
            const nestedForms = node.querySelectorAll('form:not([enctype])');
            nestedForms.forEach(form => {
              const hasFileInput = form.querySelector('input[type="file"]');
              form.setAttribute('enctype', hasFileInput ? 'multipart/form-data' : 'application/x-www-form-urlencoded');
            });
          }
        });
      }
    });
  });
  
  // Start observing for dynamic content changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log(`Form encoding attributes fixed for ${fixedCount} forms`);
}

// Theme Toggle
function setupThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle.querySelector('.theme-icon');
  
  // Check for saved theme or default to dark mode
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    
    // Add a little animation to the button
    themeToggle.style.transform = 'scale(0.9)';
    setTimeout(() => {
      themeToggle.style.transform = 'scale(1)';
    }, 150);
  });
  
  function setTheme(theme) {
    // Remove any existing theme attributes
    document.documentElement.removeAttribute('data-theme');
    document.body.classList.remove('dark-theme', 'light-theme');
    
    // Force a small delay to ensure the removal is processed
    setTimeout(() => {
      // Set new theme
      document.documentElement.setAttribute('data-theme', theme);
      document.body.classList.add(theme + '-theme');
      
      // Update localStorage
      try {
        localStorage.setItem('theme', theme);
      } catch (e) {
        console.warn('Could not save theme to localStorage:', e);
      }
      
      // Update Dark Reader lock - prevent extension from applying dark mode when app is in dark mode
      setDarkReaderLock(theme === 'dark');
      
      // Update theme-color meta tag for iOS status bar
      const themeColorMeta = document.getElementById('theme-color-meta');
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', theme === 'dark' ? '#1a202c' : '#667eea');
      }
      
      // Update Apple status bar style
      let statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (statusBarMeta) {
        statusBarMeta.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
      }
      
      // Update icon
      if (themeIcon) {
        themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
      }
      
      // Update mobile theme toggle if it exists
      const mobileThemeIcon = document.querySelector('#mobileThemeToggle .theme-icon');
      if (mobileThemeIcon) {
        mobileThemeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
      }
      
      // Update header background immediately if needed
      const header = document.querySelector('.app-header');
      if (header) {
        const currentScrollY = window.scrollY;
        const isDark = theme === 'dark';
        
        if (currentScrollY > 50) {
          header.style.background = isDark ? 'rgba(26, 32, 44, 0.98)' : 'rgba(255, 255, 255, 0.98)';
        } else {
          header.style.background = isDark ? 'rgba(26, 32, 44, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        }
      }
      
      // Force repaint on iOS
      if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        document.body.style.display = 'none';
        document.body.offsetHeight; // Trigger reflow
        document.body.style.display = '';
      }
    }, 10);
  }
}

// Helper function to detect mobile devices
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ||
         window.innerWidth <= 768;
}

// iOS-specific fixes for theme and performance
function setupiOSFixes() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  if (isIOS) {
    // Fix viewport height on iOS
    const setViewportHeight = () => {
      let vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', () => {
      setTimeout(setViewportHeight, 100);
    });
    
    // Improve theme persistence on iOS
    const checkTheme = () => {
      const savedTheme = localStorage.getItem('theme') || 'dark';
      const currentTheme = document.documentElement.getAttribute('data-theme');
      
      if (currentTheme !== savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        document.body.className = savedTheme + '-theme';
      }
    };
    
    // Check theme on page focus (important for iOS when switching between apps)
    window.addEventListener('focus', checkTheme);
    window.addEventListener('pageshow', checkTheme);
    
    // Prevent iOS zoom on input focus
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        }
      });
      
      input.addEventListener('blur', () => {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no');
        }
      });
    });
    
    // Add iOS-specific class to body
    document.body.classList.add('ios-device');
  }
}

// Dynamic Background
function setupDynamicBackground() {
  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;
  
  // Track mouse movement
  document.addEventListener('mousemove', (e) => {
    targetX = (e.clientX / window.innerWidth) * 100;
    targetY = (e.clientY / window.innerHeight) * 100;
  });
  
  // Smooth animation using requestAnimationFrame
  function updateBackground() {
    // Smooth interpolation for fluid movement
    mouseX += (targetX - mouseX) * 0.1;
    mouseY += (targetY - mouseY) * 0.1;
    
    // Update CSS custom properties
    document.documentElement.style.setProperty('--mouse-x', `${mouseX}%`);
    document.documentElement.style.setProperty('--mouse-y', `${mouseY}%`);
    
    requestAnimationFrame(updateBackground);
  }
  
  // Start the animation loop
  updateBackground();
  
  // Add subtle parallax effect to hero content
  const heroSection = document.querySelector('.hero-section');
  if (heroSection) {
    document.addEventListener('mousemove', (e) => {
      const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
      const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
      
      heroSection.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
  }
}

// Button Shimmer Effect
function setupButtonShimmer() {
  const buttons = document.querySelectorAll('.btn');
  
  buttons.forEach(button => {
    // Add mousedown event listener for left mouse button
    button.addEventListener('mousedown', (e) => {
      // Check if it's the left mouse button (button 0)
      if (e.button === 0) {
        // Remove existing shimmer class if present
        button.classList.remove('shimmer');
        
        // Force reflow to ensure class removal takes effect
        button.offsetHeight;
        
        // Add shimmer class to trigger animation
        button.classList.add('shimmer');
        
        // Remove the class after animation completes
        setTimeout(() => {
          button.classList.remove('shimmer');
        }, 800); // Match the animation duration
      }
    });
    
    // Prevent context menu on right click to avoid interference
    button.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  });
}

// Games Navigation
function setupGamesNavigation() {
  const getStartedBtn = document.getElementById('getStartedBtn');
  const portfolioBtn = document.getElementById('portfolioBtn');
  const emojiBtn = document.getElementById('emojiBtn');
  const backToHero = document.getElementById('backToHero');
  const backToGames = document.getElementById('backToGames');
  const ticTacToeCard = document.getElementById('ticTacToeCard');
  const memoryGameCard = document.getElementById('memoryGameCard');
  const snakeGameCard = document.getElementById('snakeGameCard');
  const backToGamesFromMemory = document.getElementById('backToGamesFromMemory');
  const backToGamesFromSnake = document.getElementById('backToGamesFromSnake');
  
  // Main menu elements
  const gamesMenuCard = document.getElementById('gamesMenuCard');
  const toolsMenuCard = document.getElementById('toolsMenuCard');
  const backToHeroFromMenu = document.getElementById('backToHeroFromMenu');
  
  // Tools elements
  const calculatorCard = document.getElementById('calculatorCard');
  const notepadCard = document.getElementById('notepadCard');
  const timerCard = document.getElementById('timerCard');
  const backToMenuFromTools = document.getElementById('backToMenuFromTools');
  const backToToolsFromCalculator = document.getElementById('backToToolsFromCalculator');
  const backToToolsFromNotepad = document.getElementById('backToToolsFromNotepad');
  const backToToolsFromTimer = document.getElementById('backToToolsFromTimer');

  // Show main menu when "Get Started" is clicked (only from home)
  getStartedBtn.addEventListener('click', () => {
    const currentHash = window.location.hash || '#home';
    if (currentHash === '#home') {
      navigateToSection('mainmenu', true);
      showNotification('Choose what you\'d like to explore! 🚀', 'success');
    } else if (getStartedBtn.textContent === 'View Portfolio') {
      // Navigate to portfolio section when "View Portfolio" is clicked
      navigateToSection('portfolio', true);
      showNotification('Check out my amazing projects! 🚀', 'info');
    } else if (getStartedBtn.textContent === 'Go Back to Home') {
      // Navigate back to home when "Go Back to Home" is clicked
      navigateToSection('home', true);
      showNotification('Welcome back home! 🏠', 'info');
    } else if (getStartedBtn.textContent === '😊') {
      // Release smiley emojis when smile button is clicked
      releaseEmojis();
      showNotification('Spreading happiness! 😄✨', 'success');
    } else if (getStartedBtn.textContent === 'Contact Us') {
      // Show contact notification when "Contact Us" is clicked
      showContactCard();
    } else {
      // For other sections, just show a notification
      showNotification(`${getStartedBtn.textContent} clicked!`, 'info');
    }
  });
// Show modern contact card with social links
function showContactCard() {
  // Prevent multiple cards - check if card already exists
  const existingCard = document.getElementById('contactCard');
  if (existingCard) {
    // If card exists, don't create another one
    return;
  }

  // Official SVGs from brand sources - Updated 2025 modern icons
  const icons = {
    youtube: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="8" fill="#FF0000"/><path d="M19 14v20l13-10-13-10z" fill="white"/></svg>`,
    discord: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="8" fill="#5865F2"/><path d="M38.5 15.5c-1.2-.5-2.4-1-3.8-1.2-.2.3-.4.7-.5 1-1.4-.2-2.8-.2-4.2 0-.2-.3-.3-.7-.5-1-1.4.2-2.6.7-3.8 1.2-2.9 4.3-3.7 8.5-3.3 12.6 1.6 1.2 3.1 1.9 4.6 2.3.4-.5.7-1 1-1.6-.5-.2-1-.4-1.5-.7.1-.1.3-.2.4-.3 2.9 1.3 6.1 1.3 9 0 .1.1.3.2.4.3-.5.3-1 .5-1.5.7.3.6.6 1.1 1 1.6 1.5-.4 3-1.1 4.6-2.3.5-4.8-.8-8.9-3.4-12.6zM30.2 26c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6zm5.6 0c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6z" fill="white"/></svg>`,
    linkedin: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="8" fill="#0077B5"/><path d="M13 16h5v16h-5V16zm2.5-8c1.4 0 2.5 1.1 2.5 2.5S16.9 13 15.5 13 13 11.9 13 10.5 14.1 8 15.5 8zM35 32V24c0-3.3-2.7-6-6-6-1.7 0-3.2.9-4 2.3V18h-5v14h5v-7c0-1.1.9-2 2-2s2 .9 2 2v7h6z" fill="white"/></svg>`,
    github: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="8" fill="#181717"/><path d="M24 8c-8.8 0-16 7.2-16 16 0 7.1 4.6 13.1 10.9 15.2.8.1 1.1-.3 1.1-.7v-2.6c-4.5 1-5.4-2.2-5.4-2.2-.7-1.8-1.7-2.3-1.7-2.3-1.4-1 .1-.9.1-.9 1.5.1 2.3 1.5 2.3 1.5 1.3 2.3 3.5 1.6 4.4 1.2.1-1 .5-1.6 1-2-3.3-.4-6.8-1.7-6.8-7.4 0-1.6.6-3 1.5-4-.2-.4-.7-2 .1-4.2 0 0 1.3-.4 4.1 1.5 1.2-.3 2.5-.5 3.8-.5s2.6.2 3.8.5c2.9-1.9 4.1-1.5 4.1-1.5.8 2.2.3 3.8.1 4.2 1 1 1.5 2.4 1.5 4 0 5.8-3.5 7-6.8 7.4.5.5 1 1.4 1 2.8v4.1c0 .4.3.9 1.1.7C39.4 37.1 44 31.1 44 24c0-8.8-7.2-16-16-16z" fill="white"/></svg>`,
    instagram: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="8" fill="url(#ig-gradient)"/><defs><linearGradient id="ig-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff7a00"/><stop offset="25%" stop-color="#ff0169"/><stop offset="50%" stop-color="#d300c5"/><stop offset="75%" stop-color="#7638fa"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient></defs><rect x="12" y="12" width="24" height="24" rx="6" fill="none" stroke="white" stroke-width="2.5"/><circle cx="24" cy="24" r="5.5" fill="none" stroke="white" stroke-width="2.5"/><circle cx="31" cy="17" r="1.5" fill="white"/></svg>`,
    reddit: `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="8" fill="#FF4500"/><circle cx="24" cy="26" r="12" fill="white"/><circle cx="19" cy="23" r="2" fill="#FF4500"/><circle cx="29" cy="23" r="2" fill="#FF4500"/><ellipse cx="24" cy="30" rx="4" ry="2" fill="#FF4500"/><circle cx="24" cy="14" r="3" fill="white"/><rect x="22" y="8" width="4" height="8" fill="white"/></svg>`
  };

  // Create card container with 3D perspective
  const card = document.createElement('div');
  card.id = 'contactCard';
  card.style.cssText = `
    position: fixed;
    top: 120px;
    right: 30px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
    padding: 2rem 2.5rem;
    border-radius: 1.2rem;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    z-index: 4000;
    min-width: 320px;
    max-width: 90vw;
    font-family: inherit;
    animation: slideInRight 0.4s cubic-bezier(.68,-0.55,.27,1.55);
    text-shadow: 0 2px 8px rgba(0,0,0,0.25);
    transform-style: preserve-3d;
    transition: transform 0.1s ease-out, box-shadow 0.1s ease-out;
    cursor: pointer;
  `;

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.2rem;">
      ${icons.youtube}
      <h3 style="margin:0;font-size:1.5rem;font-weight:700;letter-spacing:0.5px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.25);">Connect with Sahil</h3>
    </div>
    <div style="display:grid;gap:1.1rem;">
      <a href='https://www.youtube.com/godsahil' target='_blank' rel='noopener' class='social-link' data-platform='youtube' style='display:flex;align-items:center;gap:0.7rem;text-decoration:none;background:rgba(255,255,255,0.10);padding:0.7rem 1rem;border-radius:0.7rem;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);color:#fff;font-weight:500;position:relative;overflow:hidden;'>
        ${icons.youtube} <span style='font-weight:500;'>YouTube</span>
        <span style='margin-left:auto;font-size:1.1rem;'>@godsahil</span>
      </a>
      <a href='https://discordapp.com/users/538328153614057473' target='_blank' rel='noopener' class='social-link' data-platform='discord' style='display:flex;align-items:center;gap:0.7rem;text-decoration:none;background:rgba(255,255,255,0.10);padding:0.7rem 1rem;border-radius:0.7rem;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);color:#fff;font-weight:500;position:relative;overflow:hidden;'>
        ${icons.discord} <span style='font-weight:500;'>Discord</span>
        <span style='margin-left:auto;font-size:1.1rem;'>@GodSahil</span>
      </a>
      <a href='https://www.linkedin.com/in/kingsahil/' target='_blank' rel='noopener' class='social-link' data-platform='linkedin' style='display:flex;align-items:center;gap:0.7rem;text-decoration:none;background:rgba(255,255,255,0.10);padding:0.7rem 1rem;border-radius:0.7rem;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);color:#fff;font-weight:500;position:relative;overflow:hidden;'>
        ${icons.linkedin} <span style='font-weight:500;'>LinkedIn</span>
        <span style='margin-left:auto;font-size:1.1rem;'>@KingSahil</span>
      </a>
      <a href='https://www.github.com/kingsahil' target='_blank' rel='noopener' class='social-link' data-platform='github' style='display:flex;align-items:center;gap:0.7rem;text-decoration:none;background:rgba(255,255,255,0.10);padding:0.7rem 1rem;border-radius:0.7rem;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);color:#fff;font-weight:500;position:relative;overflow:hidden;'>
        ${icons.github} <span style='font-weight:500;'>GitHub</span>
        <span style='margin-left:auto;font-size:1.1rem;'>@KingSahil</span>
      </a>
      <a href='https://www.instagram.com/supreme__sahil/' target='_blank' rel='noopener' class='social-link' data-platform='instagram' style='display:flex;align-items:center;gap:0.7rem;text-decoration:none;background:rgba(255,255,255,0.10);padding:0.7rem 1rem;border-radius:0.7rem;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);color:#fff;font-weight:500;position:relative;overflow:hidden;'>
        ${icons.instagram} <span style='font-weight:500;'>Instagram</span>
        <span style='margin-left:auto;font-size:1.1rem;'>@supreme__sahil</span>
      </a>
      <a href='https://www.reddit.com/user/ProSahil/' target='_blank' rel='noopener' class='social-link' data-platform='reddit' style='display:flex;align-items:center;gap:0.7rem;text-decoration:none;background:rgba(255,255,255,0.10);padding:0.7rem 1rem;border-radius:0.7rem;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);color:#fff;font-weight:500;position:relative;overflow:hidden;'>
        ${icons.reddit} <span style='font-weight:500;'>Reddit</span>
        <span style='margin-left:auto;font-size:1.1rem;'>@ProSahil</span>
      </a>
    </div>
    <button id='closeContactCard' style='margin-top:1.7rem;background:#fff;color:#764ba2;font-weight:600;padding:0.6rem 1.2rem;border:none;border-radius:0.6rem;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.08);transition:background 0.2s;'>Close</button>
  `;

  document.body.appendChild(card);

  // Add 3D card effect with mouse movement
  function add3DCardEffect() {
    const cardRect = card.getBoundingClientRect();
    let isHovering = false;

    // Enhanced event handling for the entire card
    card.addEventListener('mouseenter', (e) => {
      isHovering = true;
      card.style.transition = 'transform 0.1s ease-out, box-shadow 0.1s ease-out';
    });

    card.addEventListener('mouseleave', (e) => {
      // Check if we're actually leaving the card (not just entering a child element)
      const rect = card.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        isHovering = false;
        card.style.transition = 'transform 0.4s ease-out, box-shadow 0.4s ease-out';
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
        card.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';
      }
    });

    card.addEventListener('mousemove', (e) => {
      if (!isHovering) return;

      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Calculate mouse position relative to card center
      const mouseX = e.clientX - centerX;
      const mouseY = e.clientY - centerY;
      
      // Check if hovering over a social link button
      const hoveredElement = document.elementFromPoint(e.clientX, e.clientY);
      const isOverSocialLink = hoveredElement && (
        hoveredElement.classList.contains('social-link') || 
        hoveredElement.closest('.social-link') ||
        hoveredElement.id === 'closeContactCard'
      );
      
      // Reduce 3D effect intensity when over interactive elements but keep it active
      const sensitivity = isOverSocialLink ? 0.6 : 1.0;
      
      // Calculate rotation angles
      const rotateX = (mouseY / rect.height) * -20 * sensitivity;
      const rotateY = (mouseX / rect.width) * 20 * sensitivity;
      
      // Calculate elevation based on distance from center
      const distance = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
      const maxDistance = Math.sqrt((rect.width/2) * (rect.width/2) + (rect.height/2) * (rect.height/2));
      const elevation = Math.max(0, (1 - distance / maxDistance) * 12 * sensitivity);
      
      // Apply 3D transform
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${elevation}px)`;
      
      // Enhanced shadow based on elevation and tilt
      const shadowBlur = 8 + elevation * 2;
      const shadowOpacity = 0.18 + elevation * 0.02;
      const shadowOffsetX = rotateY * 0.5;
      const shadowOffsetY = 8 + Math.abs(rotateX) * 0.5;
      
      card.style.boxShadow = `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(0,0,0,${shadowOpacity})`;
    });
  }

  // Apply 3D effect after a small delay to ensure card is rendered
  setTimeout(add3DCardEffect, 100);

  // Add dynamic glow effects to social media buttons
  function addDynamicButtonEffects() {
    const socialLinks = card.querySelectorAll('.social-link');
    
    // Platform-specific glow colors
    const glowColors = {
      youtube: '#FF0000',
      discord: '#5865F2', 
      linkedin: '#0077B5',
      github: '#181717',
      instagram: '#E4405F',
      reddit: '#FF4500'
    };

    socialLinks.forEach(link => {
      const platform = link.getAttribute('data-platform');
      const glowColor = glowColors[platform];
      
      // Improved button styling for better interaction
      link.style.position = 'relative';
      link.style.zIndex = '10';
      link.style.pointerEvents = 'auto';
      
      // Enhanced hover effects with better event propagation
      link.addEventListener('mouseenter', (e) => {
        // Don't stop propagation - let parent handle 3D effects
        link.style.background = `rgba(255,255,255,0.20)`;
        link.style.boxShadow = `0 0 20px ${glowColor}40, 0 0 40px ${glowColor}20, inset 0 0 20px rgba(255,255,255,0.1)`;
        link.style.transform = 'translateY(-2px) scale(1.02)';
        link.style.borderLeft = `3px solid ${glowColor}`;
        
        // Add subtle icon animation
        const icon = link.querySelector('svg');
        if (icon) {
          icon.style.transform = 'scale(1.1) rotate(5deg)';
          icon.style.filter = `drop-shadow(0 0 8px ${glowColor}60)`;
        }
      });
      
      link.addEventListener('mouseleave', (e) => {
        // Don't stop propagation - let parent handle 3D effects
        link.style.background = 'rgba(255,255,255,0.10)';
        link.style.boxShadow = 'none';
        link.style.transform = 'translateY(0) scale(1)';
        link.style.borderLeft = 'none';
        
        // Reset icon animation
        const icon = link.querySelector('svg');
        if (icon) {
          icon.style.transform = 'scale(1) rotate(0deg)';
          icon.style.filter = 'none';
        }
      });
      
      // Add click effect
      link.addEventListener('mousedown', (e) => {
        // Don't stop propagation
        link.style.transform = 'translateY(1px) scale(0.98)';
        link.style.boxShadow = `0 0 15px ${glowColor}60, inset 0 0 15px rgba(255,255,255,0.2)`;
      });
      
      link.addEventListener('mouseup', (e) => {
        // Don't stop propagation
        link.style.transform = 'translateY(-2px) scale(1.02)';
      });
      
      // Ensure links work properly
      link.addEventListener('click', (e) => {
        // Only stop propagation on click to prevent card from handling click
        e.stopPropagation();
        // Link will naturally navigate due to href attribute
      });
    });
  }

  // Apply button effects after card is rendered
  setTimeout(addDynamicButtonEffects, 150);

  // Close button handler
  document.getElementById('closeContactCard').onclick = () => {
    card.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => card.remove(), 300);
  };

  // Auto remove after 30 seconds
  setTimeout(() => {
    if (card.parentNode) {
      card.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => card.remove(), 300);
    }
  }, 30000);
}

  // Portfolio button functionality
  if (portfolioBtn) {
    portfolioBtn.addEventListener('click', () => {
      navigateToSection('portfolio', true);
      showNotification('Check out my amazing projects! 🚀', 'info');
    });
  }

  // Emoji button functionality
  if (emojiBtn) {
    emojiBtn.addEventListener('click', () => {
      releaseEmojis();
      showNotification('Spreading happiness! 😄✨', 'success');
    });
  }

  // Back to home section
  backToHero.addEventListener('click', () => {
    navigateToSection('home', true);
  });

  // Show Tic Tac Toe game
  ticTacToeCard.querySelector('.btn').addEventListener('click', () => {
    navigateToSection('tic-tac-toe', true);
    resetTicTacToeGame();
  });

  // Show Memory Game
  memoryGameCard.querySelector('.btn').addEventListener('click', () => {
    navigateToSection('memory-game', true);
    resetMemoryGame();
  });

  // Show Snake Game
  snakeGameCard.querySelector('.btn').addEventListener('click', () => {
    navigateToSection('snake-game', true);
    resetSnakeGame();
  });

  // Back to games menu
  backToGames.addEventListener('click', () => {
    navigateToSection('games', true);
  });

  // Back to games from Memory Game
  backToGamesFromMemory.addEventListener('click', () => {
    navigateToSection('games', true);
  });

  // Back to games from Snake Game
  backToGamesFromSnake.addEventListener('click', () => {
    navigateToSection('games', true);
  });

  // Main menu navigation
  gamesMenuCard.querySelector('.btn').addEventListener('click', () => {
    navigateToSection('games', true);
    showNotification('Welcome to Games! 🎮', 'success');
  });

  toolsMenuCard.querySelector('.btn').addEventListener('click', () => {
    navigateToSection('tools', true);
    showNotification('Welcome to Tools! 🛠️', 'success');
  });

  backToHeroFromMenu.addEventListener('click', () => {
    navigateToSection('home', true);
  });

  // Back to home from portfolio
  const backToHeroFromPortfolio = document.getElementById('backToHeroFromPortfolio');
  if (backToHeroFromPortfolio) {
    backToHeroFromPortfolio.addEventListener('click', () => {
      navigateToSection('home', true);
    });
  }

  // Tools navigation
  calculatorCard.querySelector('.btn').addEventListener('click', () => {
    navigateToSection('calculator', true);
    showNotification('Calculator ready! 🧮', 'success');
  });

  notepadCard.querySelector('.btn').addEventListener('click', () => {
    navigateToSection('notepad', true);
    showNotification('Notepad ready! 📝', 'success');
  });

  timerCard.querySelector('.btn').addEventListener('click', () => {
    navigateToSection('timer', true);
    showNotification('Timer ready! ⏱️', 'success');
  });

  backToMenuFromTools.addEventListener('click', () => {
    navigateToSection('mainmenu', true);
  });

  backToToolsFromCalculator.addEventListener('click', () => {
    navigateToSection('tools', true);
  });

  backToToolsFromNotepad.addEventListener('click', () => {
    navigateToSection('tools', true);
  });

  backToToolsFromTimer.addEventListener('click', () => {
    navigateToSection('tools', true);
  });
}

// Emoji Release Animation
function releaseEmojis() {
  const emojis = ['😊', '😄', '😁', '😃', '😀', '🙂', '😆', '😋', '🤗', '😍', '🥰', '😘'];
  const numberOfEmojis = 15;
  
  for (let i = 0; i < numberOfEmojis; i++) {
    setTimeout(() => {
      createFloatingEmoji(emojis[Math.floor(Math.random() * emojis.length)]);
    }, i * 100); // Stagger the emoji creation
  }
}

function createFloatingEmoji(emoji) {
  const emojiElement = document.createElement('div');
  emojiElement.textContent = emoji;
  emojiElement.style.cssText = `
    position: fixed;
    font-size: 2rem;
    pointer-events: none;
    z-index: 9999;
    left: ${Math.random() * window.innerWidth}px;
    top: ${window.innerHeight}px;
    animation: floatUp 3s ease-out forwards;
    user-select: none;
  `;
  
  document.body.appendChild(emojiElement);
  
  // Remove the emoji after animation completes
  setTimeout(() => {
    if (emojiElement.parentNode) {
      emojiElement.remove();
    }
  }, 3000);
}

// Tic Tac Toe Game Logic
let ticTacToeState = {
  board: Array(9).fill(''),
  currentPlayer: 'X',
  gameActive: true,
  scores: { X: 0, O: 0 }
};

function setupTicTacToe() {
  const board = document.getElementById('ticTacToeBoard');
  const resetBtn = document.getElementById('resetGame');
  
  // Add click listeners to cells
  board.addEventListener('click', handleCellClick);
  
  // Reset game button
  resetBtn.addEventListener('click', resetTicTacToeGame);
  
  updateTicTacToeDisplay();
}

function handleCellClick(e) {
  if (!e.target.classList.contains('cell')) return;
  
  const index = parseInt(e.target.dataset.index);
  
  if (ticTacToeState.board[index] !== '' || !ticTacToeState.gameActive) return;
  
  // Make move
  ticTacToeState.board[index] = ticTacToeState.currentPlayer;
  e.target.textContent = ticTacToeState.currentPlayer;
  e.target.classList.add('disabled');
  
  // Add modern styling classes for X and O
  if (ticTacToeState.currentPlayer === 'X') {
    e.target.classList.add('x');
  } else {
    e.target.classList.add('o');
  }
  
  // Check for win or draw
  if (checkWinner()) {
    ticTacToeState.scores[ticTacToeState.currentPlayer]++;
    updateTicTacToeDisplay();
    
    // Show winner at bottom instead of notification
    const gameStatus = document.getElementById('gameStatus');
    gameStatus.textContent = `🎉 Player ${ticTacToeState.currentPlayer} wins!`;
    gameStatus.style.color = '#48bb78';
    gameStatus.style.fontWeight = 'bold';
    gameStatus.style.fontSize = '1.2rem';
    
    ticTacToeState.gameActive = false;
    
    // Auto-reset after 3 seconds
    setTimeout(() => {
      resetTicTacToeGame();
    }, 3000);
  } else if (ticTacToeState.board.every(cell => cell !== '')) {
    // Show draw at bottom instead of notification
    const gameStatus = document.getElementById('gameStatus');
    gameStatus.textContent = "🤝 It's a draw!";
    gameStatus.style.color = '#4299e1';
    gameStatus.style.fontWeight = 'bold';
    gameStatus.style.fontSize = '1.2rem';
    
    ticTacToeState.gameActive = false;
    
    // Auto-reset after 3 seconds
    setTimeout(() => {
      resetTicTacToeGame();
    }, 3000);
  } else {
    // Switch player
    ticTacToeState.currentPlayer = ticTacToeState.currentPlayer === 'X' ? 'O' : 'X';
    updateTicTacToeDisplay();
  }
}

function checkWinner() {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6] // Diagonals
  ];
  
  return winPatterns.some(pattern => {
    const [a, b, c] = pattern;
    return ticTacToeState.board[a] !== '' &&
           ticTacToeState.board[a] === ticTacToeState.board[b] &&
           ticTacToeState.board[b] === ticTacToeState.board[c];
  });
}

function resetTicTacToeGame() {
  ticTacToeState.board = Array(9).fill('');
  ticTacToeState.currentPlayer = 'X';
  ticTacToeState.gameActive = true;
  
  // Clear board display
  const cells = document.querySelectorAll('.cell');
  cells.forEach(cell => {
    cell.textContent = '';
    cell.classList.remove('disabled', 'x', 'o');
  });
  
  updateTicTacToeDisplay();
}

function updateTicTacToeDisplay() {
  const currentPlayerElement = document.getElementById('currentPlayer');
  currentPlayerElement.textContent = ticTacToeState.currentPlayer;
  
  // Update current player styling
  currentPlayerElement.classList.remove('player-x', 'player-o');
  if (ticTacToeState.currentPlayer === 'X') {
    currentPlayerElement.classList.add('player-x');
  } else {
    currentPlayerElement.classList.add('player-o');
  }
  
  document.getElementById('scoreX').textContent = ticTacToeState.scores.X;
  document.getElementById('scoreO').textContent = ticTacToeState.scores.O;
  
  const status = document.getElementById('gameStatus');
  if (ticTacToeState.gameActive) {
    status.textContent = `Player ${ticTacToeState.currentPlayer}'s turn`;
    // Reset status styling for active game
    status.style.color = '';
    status.style.fontWeight = '';
    status.style.fontSize = '';
  } else {
    status.textContent = 'Game Over';
  }
}

// Add CSS animations for notifications
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }

  @keyframes floatUp {
    0% {
      opacity: 1;
      transform: translateY(0) rotate(0deg) scale(1);
    }
    50% {
      opacity: 1;
      transform: translateY(-50vh) rotate(180deg) scale(1.2);
    }
    100% {
      opacity: 0;
      transform: translateY(-100vh) rotate(360deg) scale(0.5);
    }
  }

  .notification-close {
    background: none;
    border: none;
    color: white;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0;
    margin: 0;
    line-height: 1;
  }

  .user-email {
    color: var(--text-primary);
    font-weight: 500;
    font-size: 0.9rem;
  }

  @media (max-width: 768px) {
    .notification {
      right: 10px;
      left: 10px;
      max-width: none;
    }
    
    .user-email {
      display: none;
    }
  }
  
  .pwa-install-btn {
    animation: pulseGlow 2s infinite !important;
  }
  
  @keyframes pulseGlow {
    0%, 100% { 
      transform: scale(1); 
      box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
    }
    50% { 
      transform: scale(1.05); 
      box-shadow: 0 8px 30px rgba(102, 126, 234, 0.8);
    }
  }
`;

document.head.appendChild(notificationStyles);

// Brand Navigation Setup
function setupBrandNavigation() {
  const brandTitle = document.querySelector('.nav-brand h1');
  
  if (brandTitle) {
    // Make the brand title clickable
    brandTitle.style.cursor = 'pointer';
    brandTitle.style.transition = 'all 0.3s ease';
    
    // Add hover effect
    brandTitle.addEventListener('mouseenter', () => {
      brandTitle.style.transform = 'scale(1.05)';
      brandTitle.style.color = 'var(--primary-color)';
    });
    
    brandTitle.addEventListener('mouseleave', () => {
      brandTitle.style.transform = 'scale(1)';
      brandTitle.style.color = '';
    });
    
    // Add click handler to navigate to home
    brandTitle.addEventListener('click', () => {
      navigateToSection('home', true);
      showNotification('Welcome home! 🏠', 'success');
    });
  }
}

// Global video player reference and pause function
let globalVideoPlayer = null;
let globalVideoState = { isPlaying: true, isMuted: true };
let localVideoController = null; // Reference to local state updater

function pauseVideoAudio() {
  if (globalVideoPlayer && globalVideoState.isPlaying && !globalVideoState.isMuted) {
    try {
      globalVideoPlayer.pause();
      globalVideoPlayer.setVolume(0);
      globalVideoState.isPlaying = false;
      globalVideoState.isMuted = true;
      showNotification('Video paused - navigated away from home 🎥', 'info');
      console.log('Video paused due to navigation away from home');
    } catch (error) {
      console.error('Error pausing video on navigation:', error);
    }
  }
}

function syncVideoStateOnReturn() {
  if (localVideoController) {
    localVideoController.syncState();
    console.log('Video state synced on return to home');
  }
}

// Video Player Control Logic
function setupVideoPlayer() {
  let player;
  let isPlaying = true;
  let isMuted = true;
  let isFullscreen = false;
  
  // Create local controller for state syncing
  localVideoController = {
    syncState: () => {
      isPlaying = globalVideoState.isPlaying;
      isMuted = globalVideoState.isMuted;
      console.log(`Local state synced: playing=${isPlaying}, muted=${isMuted}`);
    }
  };
  
  // Detect Android devices and browsers
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  console.log(`Device detection: Android=${isAndroid}, Mobile=${isMobile}`);
  
  // Wait for Vimeo player script to load
  const initPlayer = () => {
    const iframe = document.getElementById('vimeoPlayer');
    if (!iframe || !window.Vimeo) {
      setTimeout(initPlayer, 100);
      return;
    }
    
    player = new Vimeo.Player(iframe);
    
    // Set global references for external access
    globalVideoPlayer = player;
    globalVideoState.isPlaying = false; // Video starts paused (thumbnail)
    globalVideoState.isMuted = true;
    
    // Set initial state - paused and muted (showing thumbnail)
    player.setVolume(0).then(() => {
      player.pause(); // Ensure video is paused initially
      console.log('Video initialized: paused and muted (thumbnail mode)');
    });
    
    // Add overlay div for click handling
    const videoContainer = document.querySelector('.hero-video');
    if (videoContainer) {
      // Create an overlay div to capture clicks
      const clickOverlay = document.createElement('div');
      clickOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10;
        cursor: pointer;
        background: transparent;
        border-radius: 16px;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
      `;
      
      // Create play button overlay with custom SVG icon
      const playButton = document.createElement('div');
      playButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 5.14v13.72L19 12L8 5.14z" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"/>
        </svg>
      `;
      playButton.style.cssText = `
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.8));
        color: #1a1a1a;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(20px);
        border: 2px solid rgba(255, 255, 255, 0.5);
        opacity: 0.95;
        transform: scale(1);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 
          0 6px 20px rgba(0, 0, 0, 0.12),
          0 3px 12px rgba(0, 0, 0, 0.08),
          inset 0 1px 2px rgba(255, 255, 255, 0.8);
        cursor: pointer;
        user-select: none;
        position: relative;
      `;
      
      // Add subtle inner glow effect
      playButton.style.setProperty('--glow', '0 0 15px rgba(59, 130, 246, 0.25)');
      playButton.style.filter = 'drop-shadow(var(--glow))';
      
      // Add enhanced hover effects
      clickOverlay.addEventListener('mouseenter', () => {
        playButton.style.transform = 'scale(1.1)';
        playButton.style.opacity = '1';
        playButton.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.9))';
        playButton.style.color = 'white';
        playButton.style.setProperty('--glow', '0 0 20px rgba(59, 130, 246, 0.5)');
        playButton.style.filter = 'drop-shadow(var(--glow))';
        clickOverlay.style.background = 'rgba(0, 0, 0, 0.05)';
      });
      
      clickOverlay.addEventListener('mouseleave', () => {
        playButton.style.transform = 'scale(1)';
        playButton.style.opacity = '0.95';
        playButton.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.8))';
        playButton.style.color = '#1a1a1a';
        playButton.style.setProperty('--glow', '0 0 15px rgba(59, 130, 246, 0.25)');
        playButton.style.filter = 'drop-shadow(var(--glow))';
        clickOverlay.style.background = 'transparent';
      });
      
      // Add click animation
      const animatePlayButton = () => {
        playButton.style.transform = 'scale(0.85)';
        playButton.style.transition = 'all 0.1s ease';
        setTimeout(() => {
          playButton.style.transform = 'scale(1.15)';
          playButton.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.9))';
          playButton.style.setProperty('--glow', '0 0 25px rgba(16, 185, 129, 0.7)');
          setTimeout(() => {
            playButton.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            playButton.style.transform = 'scale(1)';
            playButton.style.opacity = '0';
          }, 150);
        }, 100);
      };
      
      // Function to restore play button to original state
      const restorePlayButton = () => {
        playButton.style.opacity = '0.95';
        playButton.style.transform = 'scale(1)';
        playButton.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.8))';
        playButton.style.color = '#1a1a1a';
        playButton.style.setProperty('--glow', '0 0 15px rgba(59, 130, 246, 0.25)');
        playButton.style.filter = 'drop-shadow(var(--glow))';
        playButton.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        clickOverlay.style.display = 'flex';
        clickOverlay.style.background = 'transparent';
      };
      
      // Make restore function globally accessible
      window.restoreVideoPlayButton = restorePlayButton;
      
      clickOverlay.appendChild(playButton);
      
      // Add the overlay to the video container
      const videoWrapper = videoContainer.querySelector('div[style*="position:relative"]');
      if (videoWrapper) {
        videoWrapper.appendChild(clickOverlay);
        
        // Android-specific event handling
        if (isAndroid) {
          let isProcessing = false;
          let lastTouchTime = 0;
          let touchHandled = false;
          
          console.log('Using enhanced Android handling for fullscreen video');
          
          // Use touchstart for immediate response
          clickOverlay.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            const currentTime = Date.now();
            
            if (currentTime - lastTouchTime < 500) {
              console.log('Touch too recent, ignoring');
              return;
            }
            
            if (isProcessing) {
              console.log('Already processing touch, ignoring');
              return;
            }
            
            lastTouchTime = currentTime;
            isProcessing = true;
            touchHandled = true;
            
            console.log('Android touchstart detected - entering fullscreen with audio');
            
            // Initialize audio context on user interaction for Android
            try {
              const audioContext = new (window.AudioContext || window.webkitAudioContext)();
              if (audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                  console.log('Audio context resumed on user interaction');
                });
              }
            } catch (audioError) {
              console.log('Audio context creation failed on touch:', audioError);
            }
            
            // Animate play button
            animatePlayButton();
            
            enterFullscreenWithAudio().finally(() => {
              setTimeout(() => {
                isProcessing = false;
                setTimeout(() => {
                  touchHandled = false;
                }, 100);
              }, 300);
            });
          }, { passive: false });
          
          // Prevent click events from firing after touch
          clickOverlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (touchHandled) {
              console.log('Click event prevented - touch already handled');
              return;
            }
            
            console.log('Android click event prevented');
          }, { passive: false });
          
        } else {
          // For iOS and desktop - enhanced fullscreen experience
          clickOverlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            animatePlayButton();
            enterFullscreenWithAudio();
          });
          
          clickOverlay.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            animatePlayButton();
            enterFullscreenWithAudio();
          });
        }
      }
    }
  };
  
  // Enhanced fullscreen function like LottieFiles/Vimeo
  const enterFullscreenWithAudio = async () => {
    if (!player) {
      console.error('Player not initialized');
      return;
    }
    
    try {
      console.log('🎬 Entering fullscreen video experience...');
      
      // Create fullscreen video overlay
      const fullscreenOverlay = document.createElement('div');
      fullscreenOverlay.id = 'videoFullscreenOverlay';
      fullscreenOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.95);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(20px);
        opacity: 0;
        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      `;
      
      // Create video container for fullscreen
      const videoContainer = document.createElement('div');
      videoContainer.style.cssText = `
        position: relative;
        width: 90vw;
        height: 90vh;
        max-width: 1200px;
        max-height: 675px;
        background: black;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        transform: scale(0.8);
        opacity: 0;
        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      `;
      
      // Create close button
      const closeButton = document.createElement('button');
      closeButton.innerHTML = '×';
      closeButton.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border: none;
        border-radius: 50%;
        font-size: 24px;
        cursor: pointer;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(10px);
        transition: all 0.3s ease;
        border: 2px solid rgba(255, 255, 255, 0.2);
      `;
      
      closeButton.addEventListener('mouseenter', () => {
        closeButton.style.background = 'rgba(239, 68, 68, 0.8)';
        closeButton.style.transform = 'scale(1.1)';
      });
      
      closeButton.addEventListener('mouseleave', () => {
        closeButton.style.background = 'rgba(0, 0, 0, 0.8)';
        closeButton.style.transform = 'scale(1)';
      });
      
      // Create new iframe for fullscreen with Android-optimized parameters
      const fullscreenIframe = document.createElement('iframe');
      
      // Enhanced URL parameters for better Android audio support with all overlays hidden
      const androidOptimizedUrl = 'https://player.vimeo.com/video/1105491173?badge=0&autopause=0&controls=0&title=0&byline=0&portrait=0&transparent=0&background=0&muted=0&loop=0&autoplay=1&playsinline=1&quality=auto&keyboard=1&pip=0&dnt=1&h=1&s=1&logo=0&color=ffffff';
      
      fullscreenIframe.src = androidOptimizedUrl;
      fullscreenIframe.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
        border-radius: 12px;
        background: #000;
      `;
      
      // Enhanced allow attributes for Android audio support
      fullscreenIframe.allow = 'autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share; microphone; camera';
      fullscreenIframe.allowfullscreen = true;
      fullscreenIframe.allowtransparency = true;
      
      // Assemble fullscreen overlay
      videoContainer.appendChild(fullscreenIframe);
      fullscreenOverlay.appendChild(videoContainer);
      fullscreenOverlay.appendChild(closeButton);
      document.body.appendChild(fullscreenOverlay);
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      // Android-specific audio initialization
      if (isAndroid) {
        console.log('🔧 Android detected - initializing audio context and user interaction');
        
        // Create a hidden audio context to unlock audio on Android
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          if (audioContext.state === 'suspended') {
            console.log('Audio context suspended - attempting to resume');
            await audioContext.resume();
          }
          console.log('Audio context state:', audioContext.state);
        } catch (audioError) {
          console.log('Audio context creation failed:', audioError);
        }
        
        // Add a click handler to the iframe to ensure user interaction
        setTimeout(() => {
          try {
            fullscreenIframe.addEventListener('load', () => {
              console.log('Fullscreen iframe loaded - ensuring audio is enabled');
              
              // Try to send a message to the iframe to enable audio
              try {
                fullscreenIframe.contentWindow.postMessage({
                  method: 'setVolume',
                  value: 1
                }, '*');
              } catch (postMessageError) {
                console.log('PostMessage to iframe failed:', postMessageError);
              }
            });
          } catch (iframeError) {
            console.log('Iframe event listener failed:', iframeError);
          }
        }, 100);
      }
      
      // Animate in
      setTimeout(() => {
        fullscreenOverlay.style.opacity = '1';
        videoContainer.style.opacity = '1';
        videoContainer.style.transform = 'scale(1)';
      }, 50);
      
      // Set fullscreen flag
      isFullscreen = true;
      
      // Close function
      const closeFullscreen = () => {
        if (!isFullscreen) return;
        
        console.log('🚪 Closing fullscreen video...');
        
        // Animate out
        fullscreenOverlay.style.opacity = '0';
        videoContainer.style.opacity = '0';
        videoContainer.style.transform = 'scale(0.8)';
        
        setTimeout(() => {
          if (fullscreenOverlay.parentNode) {
            fullscreenOverlay.remove();
          }
          document.body.style.overflow = 'auto';
          isFullscreen = false;
          
          // Return to thumbnail state - pause the original video and ensure play button is visible
          if (player) {
            player.pause().catch(console.error);
            player.setVolume(0); // Keep muted
            // Update global state to paused
            globalVideoState.isPlaying = false;
            globalVideoState.isMuted = true;
            
            // Restore the play button to its original state
            if (window.restoreVideoPlayButton) {
              window.restoreVideoPlayButton();
            }
          }
        }, 500);
        
        showNotification('📹 Fullscreen video closed', 'info');
      };
      
      // Event listeners for closing
      closeButton.addEventListener('click', closeFullscreen);
      
      // Close on Escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape' && isFullscreen) {
          closeFullscreen();
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
      
      // Close on background click
      fullscreenOverlay.addEventListener('click', (e) => {
        if (e.target === fullscreenOverlay) {
          closeFullscreen();
        }
      });
      
      // Pause original video
      await player.pause();
      
      showNotification('🎬 Fullscreen video with audio! Press ESC to close', 'success');
      
    } catch (error) {
      console.error('Error entering fullscreen:', error);
      showNotification('❌ Could not enter fullscreen mode', 'error');
    }
  };
  
  const toggleVideoPlayback = async () => {
    if (!player) {
      console.error('Player not initialized');
      return;
    }
    
    // Add function-level debouncing for Android stability
    if (toggleVideoPlayback.isExecuting) {
      console.log('Toggle already executing, skipping');
      return;
    }
    
    toggleVideoPlayback.isExecuting = true;
    
    try {
      // Get actual player state instead of relying on local variables
      const playerPaused = await player.getPaused();
      const playerVolume = await player.getVolume();
      
      console.log(`Actual player state: paused=${playerPaused}, volume=${playerVolume}`);
      console.log(`Local state before: playing=${isPlaying}, muted=${isMuted}`);
      
      // Sync local state with actual player state
      isPlaying = !playerPaused;
      isMuted = playerVolume === 0;
      
      console.log(`Synced local state: playing=${isPlaying}, muted=${isMuted}`);
      
      // Handle thumbnail mode - video starts paused
      if (!isPlaying && isMuted) {
        // First interaction from thumbnail - start playing with audio
        console.log('First interaction from thumbnail - starting video with sound');
        await player.play();
        // Small delay before unmuting for stability
        await new Promise(resolve => setTimeout(resolve, 200));
        await player.setVolume(1);
        isPlaying = true;
        isMuted = false;
        // Update global state
        globalVideoState.isPlaying = true;
        globalVideoState.isMuted = false;
        showNotification('🎬 Playing with sound! 🔊', 'success');
        console.log('Video started from thumbnail with audio');
      }
      // Check if this is a subsequent interaction (video playing and muted)
      else if (isPlaying && isMuted) {
        // Unmute while keeping video playing
        console.log('Unmuting video while keeping it playing');
        await player.setVolume(1);
        isMuted = false;
        // Update global state
        globalVideoState.isMuted = false;
        showNotification('🔊 Audio enabled! Video playing with sound', 'success');
        console.log('Video unmuted successfully, still playing');
      } else if (isPlaying && !isMuted) {
        // Video is playing with sound - pause it
        console.log('Video playing with sound - pausing');
        await player.pause();
        await player.setVolume(0);
        isPlaying = false;
        isMuted = true;
        // Update global state
        globalVideoState.isPlaying = false;
        globalVideoState.isMuted = true;
        showNotification('Video paused 🎥', 'info');
        console.log('Video successfully paused and muted');
      } else {
        // Video is paused - play with audio
        console.log('Video paused - playing with sound');
        
        // Standard handling for all browsers
        try {
          await player.play();
          // Add small delay before volume change for Android
          await new Promise(resolve => setTimeout(resolve, 200));
          await player.setVolume(1);
          isPlaying = true;
          isMuted = false;
          // Update global state
          globalVideoState.isPlaying = true;
          globalVideoState.isMuted = false;
          showNotification('Playing with sound 🔊', 'success');
          console.log('Video successfully playing with sound');
        } catch (playError) {
          console.log('Play failed, trying alternative approach for Android');
          // Android sometimes needs play first, then volume
          await player.play();
          setTimeout(async () => {
            try {
              await player.setVolume(1);
              isPlaying = true;
              isMuted = false;
              // Update global state
              globalVideoState.isPlaying = true;
              globalVideoState.isMuted = false;
              showNotification('Playing with sound 🔊', 'success');
              console.log('Video playing with delayed volume adjustment');
            } catch (volumeError) {
              console.error('Volume adjustment failed:', volumeError);
            }
          }, 300);
        }
      }
    } catch (error) {
      console.error('Video control error:', error);
      showNotification('Video control error', 'error');
    } finally {
      // Always reset the execution flag
      setTimeout(() => {
        toggleVideoPlayback.isExecuting = false;
        console.log('Execution flag reset');
      }, 300);
    }
  };
  
  // Initialize when DOM is ready and Vimeo script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayer);
  } else {
    initPlayer();
  }
}

// Memory Game Logic
let memoryGameState = {
  cards: [],
  flippedCards: [],
  matchedPairs: 0,
  player1Score: 0,
  player2Score: 0,
  currentPlayer: 1,
  gameActive: false
};

const memoryGameSymbols = ['🎮', '🎯', '🎪', '🎨', '🎭', '🎪', '🎲', '🎳'];

function setupMemoryGame() {
  const resetBtn = document.getElementById('resetMemoryGame');
  resetBtn.addEventListener('click', resetMemoryGame);
}

function createMemoryCards() {
  const board = document.getElementById('memoryBoard');
  board.innerHTML = '';
  
  // Create pairs of symbols
  const symbols = [...memoryGameSymbols, ...memoryGameSymbols];
  symbols.sort(() => Math.random() - 0.5);
  
  memoryGameState.cards = symbols.map((symbol, index) => ({
    id: index,
    symbol: symbol,
    flipped: false,
    matched: false
  }));
  
  memoryGameState.cards.forEach((card, index) => {
    const cardElement = document.createElement('div');
    cardElement.className = 'memory-card';
    cardElement.dataset.id = index;
    cardElement.innerHTML = card.symbol;
    cardElement.addEventListener('click', () => handleMemoryCardClick(index));
    board.appendChild(cardElement);
  });
}

function handleMemoryCardClick(cardId) {
  if (!memoryGameState.gameActive) return;
  
  const card = memoryGameState.cards[cardId];
  const cardElement = document.querySelector(`[data-id="${cardId}"]`);
  
  if (card.flipped || card.matched || memoryGameState.flippedCards.length >= 2) return;
  
  // Flip card
  card.flipped = true;
  cardElement.classList.add('flipped');
  memoryGameState.flippedCards.push(cardId);
  
  if (memoryGameState.flippedCards.length === 2) {
    updateMemoryDisplay();
    
    const [firstCardId, secondCardId] = memoryGameState.flippedCards;
    const firstCard = memoryGameState.cards[firstCardId];
    const secondCard = memoryGameState.cards[secondCardId];
    
    if (firstCard.symbol === secondCard.symbol) {
      // Match found - current player gets the point
      setTimeout(() => {
        firstCard.matched = true;
        secondCard.matched = true;
        document.querySelector(`[data-id="${firstCardId}"]`).classList.add('matched');
        document.querySelector(`[data-id="${secondCardId}"]`).classList.add('matched');
        
        // Award point to current player
        if (memoryGameState.currentPlayer === 1) {
          memoryGameState.player1Score++;
        } else {
          memoryGameState.player2Score++;
        }
        memoryGameState.matchedPairs++;
        memoryGameState.flippedCards = [];
        updateMemoryDisplay();
        
        if (memoryGameState.matchedPairs === memoryGameSymbols.length) {
          memoryGameWin();
        }
        // Player gets another turn when they make a match (don't switch players)
      }, 500);
    } else {
      // No match - switch to next player
      setTimeout(() => {
        firstCard.flipped = false;
        secondCard.flipped = false;
        document.querySelector(`[data-id="${firstCardId}"]`).classList.remove('flipped');
        document.querySelector(`[data-id="${secondCardId}"]`).classList.remove('flipped');
        memoryGameState.flippedCards = [];
        
        // Switch to next player
        memoryGameState.currentPlayer = memoryGameState.currentPlayer === 1 ? 2 : 1;
        updateMemoryDisplay();
      }, 1000);
    }
  }
}

function updateMemoryDisplay() {
  document.getElementById('player1Score').textContent = memoryGameState.player1Score;
  document.getElementById('player2Score').textContent = memoryGameState.player2Score;
  document.getElementById('currentMemoryPlayer').textContent = memoryGameState.currentPlayer;
}

function memoryGameWin() {
  memoryGameState.gameActive = false;
  
  // Show winner message at bottom based on scores
  const memoryStatus = document.getElementById('memoryStatus');
  const p1 = memoryGameState.player1Score;
  const p2 = memoryGameState.player2Score;
  let resultText;
  if (p1 > p2) {
    resultText = '🎉 Player 1 wins!';
  } else if (p2 > p1) {
    resultText = '🎉 Player 2 wins!';
  } else {
    resultText = "🤝 It's a tie!";
  }
  memoryStatus.textContent = resultText;
  memoryStatus.style.color = '#48bb78';
  memoryStatus.style.fontWeight = 'bold';
  memoryStatus.style.fontSize = '1.2rem';
  
  // Auto-reset after 5 seconds to give more time to read the message
  setTimeout(() => {
    resetMemoryGame();
  }, 5000);
}

function resetMemoryGame() {
  memoryGameState = {
    cards: [],
    flippedCards: [],
    matchedPairs: 0,
    player1Score: 0,
    player2Score: 0,
    currentPlayer: 1,
    gameActive: true
  };
  
  createMemoryCards();
  updateMemoryDisplay();
  
  // Reset status message and styling
  const memoryStatus = document.getElementById('memoryStatus');
  memoryStatus.textContent = 'Click cards to match pairs!';
  memoryStatus.style.color = '';
  memoryStatus.style.fontWeight = '';
  memoryStatus.style.fontSize = '';
}

// Snake Game Logic
let snakeGameState = {
  canvas: null,
  ctx: null,
  snake: [
    {x: 200, y: 200}, // Head
    {x: 180, y: 200}  // Body
  ],
  direction: {x: 0, y: 0},
  food: {x: 0, y: 0},
  score: 0,
  highScore: getUserHighScore(),
  gameActive: false,
  gameOver: false,
  gameLoop: null,
  lastMoveTime: 0,
  moveInterval: 150 // Move every 150ms for smooth gameplay - starts slower for better control
};

// Function to get user-specific high score
function getUserHighScore() {
  const auth = window.firebaseAuth;
  
  console.log('🔍 getUserHighScore() called - checking all storage keys...');
  
  // Debug: Show all snake high score keys in localStorage
  const allKeys = Object.keys(localStorage).filter(key => key.includes('snakeHighScore'));
  console.log('🗂️ All snake high score keys in localStorage:', allKeys);
  allKeys.forEach(key => {
    console.log(`   ${key}: ${localStorage.getItem(key)}`);
  });
  
  // First, try to get user ID from current auth state
  if (auth && auth.currentUser) {
    // User is logged in - get user-specific high score
    const key = `snakeHighScore_${auth.currentUser.uid}`;
    const userHighScore = localStorage.getItem(key);
    console.log(`📊 Loading high score for authenticated user (${auth.currentUser.email}): ${userHighScore || 0} (key: ${key})`);
    return parseInt(userHighScore) || 0;
  }
  
  // If auth isn't ready yet, check cached user data
  const cachedUser = localStorage.getItem('firebase_cached_user');
  if (cachedUser) {
    try {
      const userData = JSON.parse(cachedUser);
      const key = `snakeHighScore_${userData.uid}`;
      const userHighScore = localStorage.getItem(key);
      console.log(`📊 Loading high score for cached user (${userData.email}): ${userHighScore || 0} (key: ${key})`);
      return parseInt(userHighScore) || 0;
    } catch (e) {
      console.warn('⚠️ Invalid cached user data for high score:', e);
    }
  }
  
  // User not logged in - use anonymous high score
  const key = 'snakeHighScore_anonymous';
  const anonymousHighScore = localStorage.getItem(key);
  console.log(`📊 Loading anonymous high score: ${anonymousHighScore || 0} (key: ${key})`);
  return parseInt(anonymousHighScore) || 0;
}

// Function to save user-specific high score
function saveUserHighScore(score) {
  const auth = window.firebaseAuth;
  
  console.log('💾 saveUserHighScore() called with score:', score);
  console.log('🔍 Current auth state:', {
    authExists: !!auth,
    currentUser: auth?.currentUser?.email || 'none',
    uid: auth?.currentUser?.uid || 'none'
  });
  
  // First, try to save with current auth state
  if (auth && auth.currentUser) {
    // User is logged in - save user-specific high score
    const key = `snakeHighScore_${auth.currentUser.uid}`;
    localStorage.setItem(key, score);
    console.log(`💾✅ High score ${score} SAVED for authenticated user: ${auth.currentUser.displayName || auth.currentUser.email} (key: ${key})`);
    
    // Verify it was saved
    const saved = localStorage.getItem(key);
    console.log(`🔍 Verification - value in storage: ${saved}`);
    return;
  }
  
  // If auth isn't ready yet, check cached user data
  const cachedUser = localStorage.getItem('firebase_cached_user');
  if (cachedUser) {
    try {
      const userData = JSON.parse(cachedUser);
      const key = `snakeHighScore_${userData.uid}`;
      localStorage.setItem(key, score);
      console.log(`💾✅ High score ${score} SAVED for cached user: ${userData.displayName || userData.email} (key: ${key})`);
      
      // Verify it was saved
      const saved = localStorage.getItem(key);
      console.log(`🔍 Verification - value in storage: ${saved}`);
      return;
    } catch (e) {
      console.warn('⚠️ Invalid cached user data for saving high score:', e);
    }
  }
  
  // User not logged in - save anonymous high score
  const key = 'snakeHighScore_anonymous';
  localStorage.setItem(key, score);
  console.log(`💾✅ Anonymous high score ${score} SAVED (key: ${key})`);
  
  // Verify it was saved
  const saved = localStorage.getItem(key);
  console.log(`🔍 Verification - value in storage: ${saved}`);
}

// Function to refresh high score when authentication state changes
function refreshUserHighScore() {
  console.log('🔄 refreshUserHighScore() called');
  console.log('🔍 Current game state high score:', snakeGameState.highScore);
  
  const newHighScore = getUserHighScore();
  console.log('🔍 Retrieved high score from storage:', newHighScore);
  
  if (newHighScore !== snakeGameState.highScore) {
    console.log(`🔄 High score changed: ${snakeGameState.highScore} → ${newHighScore}`);
    snakeGameState.highScore = newHighScore;
    updateSnakeDisplay();
    console.log(`🔄 High score refreshed and display updated: ${newHighScore}`);
  } else {
    console.log('🔄 High score unchanged, no refresh needed');
  }
}

function setupSnakeGame() {
  const canvas = document.getElementById('snakeCanvas');
  const ctx = canvas.getContext('2d');
  const resetBtn = document.getElementById('resetSnakeGame');
  
  // Only initialize if canvas exists (game section is loaded)
  if (!canvas || !ctx || !resetBtn) {
    return;
  }
  
  snakeGameState.canvas = canvas;
  snakeGameState.ctx = ctx;
  
  resetBtn.addEventListener('click', resetSnakeGame);
  
  // Add keyboard controls
  document.addEventListener('keydown', handleSnakeKeyPress);
  
  // Add touch controls for mobile
  setupTouchControls(canvas);
  
  updateSnakeDisplay();
  
  // Initialize the game in a ready state without triggering game over
  resetSnakeGame();
}

function setupTouchControls(canvas) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  
  // Handle touch start
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: false });
  
  // Handle touch move (for swipe detection)
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });
  
  // Handle touch end (detect swipe direction)
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    touchEndX = touch.clientX;
    touchEndY = touch.clientY;
    
    handleSwipe();
  }, { passive: false });
  
  function handleSwipe() {
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const minSwipeDistance = 30; // Minimum distance for a swipe
    
    // Check if it's a significant swipe
    if (Math.abs(deltaX) < minSwipeDistance && Math.abs(deltaY) < minSwipeDistance) {
      return; // Not a swipe, just a tap
    }
    
    // Don't allow movement if game is over
    if (snakeGameState.gameOver) {
      return;
    }
    
    const direction = snakeGameState.direction;
    
    // Start game on first swipe (only if not game over)
    if (!snakeGameState.gameActive && !snakeGameState.gameOver) {
      let newDirection = null;
      
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (deltaX > 0) {
          newDirection = {x: 20, y: 0};
        } else if (deltaX < 0) {
          newDirection = {x: -20, y: 0};
        }
      } else {
        // Vertical swipe
        if (deltaY > 0) {
          newDirection = {x: 0, y: 20};
        } else if (deltaY < 0) {
          newDirection = {x: 0, y: -20};
        }
      }
      
      // Check if the new direction would cause immediate collision with body
      if (newDirection) {
        const head = snakeGameState.snake[0];
        const newHead = {
          x: head.x + newDirection.x,
          y: head.y + newDirection.y
        };
        
        // Check if new head position would collide with any body segment
        const wouldCollide = snakeGameState.snake.slice(1).some(segment => 
          segment.x === newHead.x && segment.y === newHead.y
        );
        
        if (!wouldCollide) {
          snakeGameState.direction = newDirection;
          snakeGameState.gameActive = true;
          snakeGameState.lastMoveTime = performance.now();
          startSnakeGameLoop();
          document.getElementById('snakeStatus').textContent = 'Game started! ' + (isMobileDevice() ? 'Swipe to move' : 'Use arrow keys to move');
        } else {
          // Show a warning message instead of starting the game
          document.getElementById('snakeStatus').textContent = 'Invalid direction! Try a different swipe.';
          setTimeout(() => {
            document.getElementById('snakeStatus').textContent = isMobileDevice() ? 'Swipe to start playing!' : 'Press any arrow key to start!';
          }, 1500);
        }
      }
      return; // Exit early if game wasn't active
    }
    
    // Determine swipe direction - only if game is active and not over
    if (snakeGameState.gameActive && !snakeGameState.gameOver) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (deltaX > 0 && direction.x === 0) {
          // Swipe right
          snakeGameState.direction = {x: 20, y: 0};
        } else if (deltaX < 0 && direction.x === 0) {
          // Swipe left
          snakeGameState.direction = {x: -20, y: 0};
        }
      } else {
        // Vertical swipe
        if (deltaY > 0 && direction.y === 0) {
          // Swipe down
          snakeGameState.direction = {x: 0, y: 20};
        } else if (deltaY < 0 && direction.y === 0) {
          // Swipe up
          snakeGameState.direction = {x: 0, y: -20};
        }
      }
    }
  }
}

function handleSnakeKeyPress(e) {
  const key = e.key;
  
  // Prevent arrow keys from scrolling the page
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) {
    e.preventDefault();
  }
  
  // Handle game restart with Enter key
  if (key === 'Enter') {
    if (snakeGameState.gameOver) {
      resetSnakeGame();
      return;
    }
  }
  
  // Don't allow movement if game is over
  if (snakeGameState.gameOver) {
    return;
  }
  
  const direction = snakeGameState.direction;
  
  // Start game on first arrow key press (only if not game over)
  if (!snakeGameState.gameActive && !snakeGameState.gameOver) {
    // First check if this key press should start the game
    let newDirection = null;
    
    switch(key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        newDirection = {x: 0, y: -20};
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        newDirection = {x: 0, y: 20};
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        newDirection = {x: -20, y: 0};
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        newDirection = {x: 20, y: 0};
        break;
    }
    
    // Check if the new direction would cause immediate collision with body
    if (newDirection) {
      const head = snakeGameState.snake[0];
      const newHead = {
        x: head.x + newDirection.x,
        y: head.y + newDirection.y
      };
      
      // Check if new head position would collide with any body segment
      const wouldCollide = snakeGameState.snake.slice(1).some(segment => 
        segment.x === newHead.x && segment.y === newHead.y
      );
      
      if (!wouldCollide) {
        // Safe to start game with this direction
        snakeGameState.direction = newDirection;
        snakeGameState.gameActive = true;
        snakeGameState.lastMoveTime = performance.now();
        startSnakeGameLoop();
        document.getElementById('snakeStatus').textContent = 'Game started! ' + (isMobileDevice() ? 'Swipe to move' : 'Use arrow keys to move');
      } else {
        // Show a warning message instead of starting the game
        document.getElementById('snakeStatus').textContent = 'Invalid direction! Try a different key.';
        setTimeout(() => {
          document.getElementById('snakeStatus').textContent = isMobileDevice() ? 'Swipe to start playing!' : 'Press any arrow key to start!';
        }, 1500);
      }
    }
    return; // Exit early if game wasn't active
  }
  
  // Only process arrow keys if game is active and not over
  if (snakeGameState.gameActive && !snakeGameState.gameOver) {
    switch(key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        if (direction.y === 0) snakeGameState.direction = {x: 0, y: -20};
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        if (direction.y === 0) snakeGameState.direction = {x: 0, y: 20};
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        if (direction.x === 0) snakeGameState.direction = {x: -20, y: 0};
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        if (direction.x === 0) snakeGameState.direction = {x: 20, y: 0};
        break;
    }
  }
}

function generateSnakeFood() {
  let newFood;
  let validPosition = false;
  
  // Keep generating until we find a position not occupied by snake
  while (!validPosition) {
    newFood = {
      x: Math.floor(Math.random() * 20) * 20,
      y: Math.floor(Math.random() * 20) * 20
    };
    
    // Check if food position conflicts with snake
    validPosition = !snakeGameState.snake.some(segment => 
      segment.x === newFood.x && segment.y === newFood.y
    );
  }
  
  snakeGameState.food = newFood;
}

function drawSnakeGame() {
  const ctx = snakeGameState.ctx;
  const canvas = snakeGameState.canvas;
  
  // Clear canvas with smooth black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Enable smooth rendering
  ctx.imageSmoothingEnabled = true;
  
  // Draw snake with smooth gradients
  snakeGameState.snake.forEach((segment, index) => {
    if (index === 0) {
      // Head - gradient from dark to light green
      const gradient = ctx.createRadialGradient(
        segment.x + 9, segment.y + 9, 2,
        segment.x + 9, segment.y + 9, 12
      );
      gradient.addColorStop(0, '#4ade80');
      gradient.addColorStop(1, '#22c55e');
      ctx.fillStyle = gradient;
    } else {
      // Body - solid bright green with subtle gradient
      const gradient = ctx.createLinearGradient(
        segment.x, segment.y,
        segment.x + 18, segment.y + 18
      );
      gradient.addColorStop(0, '#48bb78');
      gradient.addColorStop(1, '#38a169');
      ctx.fillStyle = gradient;
    }
    
    // Draw rounded rectangle for smoother look
    drawRoundedRect(ctx, segment.x, segment.y, 18, 18, 3);
    
    // Add subtle border
    ctx.strokeStyle = index === 0 ? '#16a34a' : '#2d5a27';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  
  // Draw food with pulsing effect
  const time = Date.now() * 0.005;
  const pulse = Math.sin(time) * 0.1 + 0.9;
  const size = 18 * pulse;
  const offset = (18 - size) / 2;
  
  const foodGradient = ctx.createRadialGradient(
    snakeGameState.food.x + 9, snakeGameState.food.y + 9, 2,
    snakeGameState.food.x + 9, snakeGameState.food.y + 9, 12
  );
  foodGradient.addColorStop(0, '#fca5a5');
  foodGradient.addColorStop(1, '#ef4444');
  ctx.fillStyle = foodGradient;
  
  drawRoundedRect(ctx, 
    snakeGameState.food.x + offset, 
    snakeGameState.food.y + offset, 
    size, size, 3
  );
  
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function drawGameOverScreen() {
  const ctx = snakeGameState.ctx;
  const canvas = snakeGameState.canvas;
  
  // Don't draw if canvas context is not available
  if (!ctx || !canvas) {
    return;
  }
  
  // Draw semi-transparent overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw game over text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 60);
  
  // Draw score
  ctx.font = 'bold 24px Arial';
  ctx.fillText(`Score: ${snakeGameState.score}`, canvas.width / 2, canvas.height / 2 - 20);
  
  // Draw high score if it's a new record
  if (snakeGameState.score === snakeGameState.highScore && snakeGameState.score > 0) {
    ctx.fillStyle = '#ffd700';
    ctx.fillText('🏆 NEW HIGH SCORE! 🏆', canvas.width / 2, canvas.height / 2 + 20);
  } else {
    ctx.fillStyle = '#cccccc';
    ctx.fillText(`High Score: ${snakeGameState.highScore}`, canvas.width / 2, canvas.height / 2 + 20);
  }
  
  // Draw restart instruction
  ctx.fillStyle = '#48bb78';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('Press Enter to Play Again', canvas.width / 2, canvas.height / 2 + 60);
}

function startSnakeGameLoop() {
  function gameLoop(currentTime) {
    if (!snakeGameState.gameActive) return;
    
    // Always draw the game for smooth visuals
    drawSnakeGame();
    
    // Only update game logic at specified intervals
    if (currentTime - snakeGameState.lastMoveTime >= snakeGameState.moveInterval) {
      updateSnakeGame();
      snakeGameState.lastMoveTime = currentTime;
    }
    
    // Continue the loop
    snakeGameState.gameLoop = requestAnimationFrame(gameLoop);
  }
  
  snakeGameState.gameLoop = requestAnimationFrame(gameLoop);
}

function updateSnakeGame() {
  if (!snakeGameState.gameActive || snakeGameState.gameOver) return;
  
  // Don't move if no direction is set
  if (snakeGameState.direction.x === 0 && snakeGameState.direction.y === 0) {
    return;
  }
  
  const head = {
    x: snakeGameState.snake[0].x + snakeGameState.direction.x,
    y: snakeGameState.snake[0].y + snakeGameState.direction.y
  };
  
  // Check wall collision
  if (head.x < 0 || head.x >= 400 || head.y < 0 || head.y >= 400) {
    snakeGameOver();
    return;
  }
  
  // Check self collision
  if (snakeGameState.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
    snakeGameOver();
    return;
  }
  
  snakeGameState.snake.unshift(head);
  
  // Check food collision
  if (head.x === snakeGameState.food.x && head.y === snakeGameState.food.y) {
    snakeGameState.score += 10;
    updateSnakeDisplay();
    generateSnakeFood();
    
    // Increase speed more aggressively as score increases
    if (snakeGameState.moveInterval > 60) {
      snakeGameState.moveInterval = Math.max(60, snakeGameState.moveInterval - 5);
    }
  } else {
    snakeGameState.snake.pop();
  }
}

function snakeGameOver() {
  // Don't show game over if the snake game section isn't even visible
  const snakeGameSection = document.getElementById('snakeGame');
  if (!snakeGameSection || snakeGameSection.style.display === 'none') {
    return;
  }
  
  snakeGameState.gameActive = false;
  snakeGameState.gameOver = true;
  cancelAnimationFrame(snakeGameState.gameLoop);
  
  let gameOverMessage = `Game Over! Score: ${snakeGameState.score}`;
  
  // Only show notifications if the game was actually played (score > 0 or direction was set)
  const gameWasPlayed = snakeGameState.score > 0 || snakeGameState.direction.x !== 0 || snakeGameState.direction.y !== 0;
  
  // Debug: Log when game over is triggered inappropriately
  if (!gameWasPlayed) {
    console.log('Snake game over triggered without gameplay - suppressing notification');
  }
  
  if (snakeGameState.score > snakeGameState.highScore) {
    snakeGameState.highScore = snakeGameState.score;
    saveUserHighScore(snakeGameState.highScore);
    updateSnakeDisplay();
    gameOverMessage = `🏆 New High Score: ${snakeGameState.score}!`;
    if (gameWasPlayed) {
      showNotification(`New High Score: ${snakeGameState.score}! 🏆`, 'success');
    }
  } else {
    if (gameWasPlayed) {
      showNotification(`Game Over! Score: ${snakeGameState.score}`, 'info');
    }
  }
  
  const statusElement = document.getElementById('snakeStatus');
  if (statusElement) {
    statusElement.textContent = `${gameOverMessage} - ${isMobileDevice() ? 'Tap Reset to play again' : 'Press Enter to play again'}`;
  }
  
  // Draw game over screen
  drawGameOverScreen();
}

function updateSnakeDisplay() {
  document.getElementById('snakeScore').textContent = snakeGameState.score;
  document.getElementById('snakeHighScore').textContent = snakeGameState.highScore;
}

function resetSnakeGame() {
  cancelAnimationFrame(snakeGameState.gameLoop);
  
  // Start with 2 segments: head and one body segment
  // Position them horizontally with body to the RIGHT of head
  // This way, only moving RIGHT (into body) is blocked - all other directions are safe
  snakeGameState.snake = [
    {x: 200, y: 200}, // Head
    {x: 220, y: 200}  // Body (to the RIGHT of head, so only right direction is blocked)
  ];
  snakeGameState.direction = {x: 0, y: 0};
  snakeGameState.score = 0;
  
  // Refresh high score from storage (in case auth state changed)
  snakeGameState.highScore = getUserHighScore();
  
  snakeGameState.gameActive = false; // Don't start automatically
  snakeGameState.gameOver = false; // Reset game over state
  snakeGameState.lastMoveTime = 0;
  snakeGameState.moveInterval = 150; // Reset speed to starting speed
  
  generateSnakeFood();
  updateSnakeDisplay();
  document.getElementById('snakeStatus').textContent = isMobileDevice() ? 'Swipe to start playing!' : 'Press any arrow key to start!';
  
  drawSnakeGame();
  
  // Don't start the game loop here - wait for user input
}

// Calculator Functions
function initializeCalculator() {
  const input = document.getElementById('calculatorInput');
  if (input && !input.value) {
    input.value = '0';
  }
  // Focus the input for immediate keyboard use
  if (input) {
    input.focus();
  }
}

function appendToCalculator(value) {
  const input = document.getElementById('calculatorInput');
  const currentValue = input.value;
  
  // Check if there's selected text and replace it
  if (input.selectionStart !== input.selectionEnd) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const beforeSelection = currentValue.slice(0, start);
    const afterSelection = currentValue.slice(end);
    
    // Handle special cases when replacing selection
    if (beforeSelection === '' && afterSelection === '' && value !== '.' && value !== ')') {
      // Replacing the entire display
      input.value = value;
    } else {
      // Insert the new value at the selection
      let newValue = beforeSelection + value + afterSelection;
      
      // Handle edge cases for operators
      if (newValue === value && value !== '.' && value !== ')' && currentValue !== 'Error') {
        // If we're replacing everything with just an operator, that might not make sense
        if (['+', '-', '*', '×', '/', '^'].includes(value) && beforeSelection === '' && afterSelection === '') {
          newValue = '0' + value;
        }
      }
      
      input.value = newValue || '0';
      
      // Set cursor position after the inserted value
      const newCursorPos = start + value.length;
      input.setSelectionRange(newCursorPos, newCursorPos);
    }
    return;
  }
  
  // Smart handling for different input types (original logic)
  if (currentValue === '0' && value !== '.' && value !== ')') {
    input.value = value;
  } else if (currentValue === 'Error') {
    // Reset on error and start fresh
    input.value = value;
  } else {
    // Prevent consecutive operators (except for opening parentheses)
    const lastChar = currentValue.slice(-1);
    const operators = ['+', '-', '*', '×', '/', '^'];
    
    if (operators.includes(lastChar) && operators.includes(value)) {
      // Replace the last operator with the new one
      input.value = currentValue.slice(0, -1) + value;
    } else if (value === ')' && currentValue === '0') {
      // Don't allow closing parenthesis at the start
      return;
    } else if (value === '(' && /\d$/.test(lastChar)) {
      // Add multiplication before opening parenthesis after a number
      input.value += '×' + value;
    } else if (value === '√') {
      // Handle square root insertion
      if (/\d$/.test(lastChar)) {
        // Add multiplication before square root after a number
        input.value += '×√';
      } else {
        input.value += '√';
      }
    } else if (value === '!') {
      // Factorial can only be added after numbers or closing parentheses
      if (/[\d)]$/.test(lastChar)) {
        input.value += value;
      }
      // Ignore factorial if not after a number or closing parenthesis
    } else {
      input.value += value;
    }
  }
  
  // Ensure cursor is at the end when no selection was involved
  if (input.selectionStart === input.selectionEnd) {
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }
}

function clearCalculator() {
  const input = document.getElementById('calculatorInput');
  input.value = '0';
  // Set cursor at the end
  input.setSelectionRange(1, 1);
}

function deleteLastCalculator() {
  const input = document.getElementById('calculatorInput');
  
  // Check if there's selected text
  if (input.selectionStart !== input.selectionEnd) {
    deleteSelectedText();
    return;
  }
  
  // Normal backspace behavior when no text is selected
  if (input.value.length > 1) {
    const newValue = input.value.slice(0, -1);
    input.value = newValue;
    // Ensure cursor is at the end after deletion
    input.setSelectionRange(newValue.length, newValue.length);
  } else {
    input.value = '0';
    // Set cursor at the end of '0'
    input.setSelectionRange(1, 1);
  }
}

// Function to delete selected text
function deleteSelectedText() {
  const input = document.getElementById('calculatorInput');
  const start = input.selectionStart;
  const end = input.selectionEnd;
  
  if (start !== end) {
    const currentValue = input.value;
    const newValue = currentValue.slice(0, start) + currentValue.slice(end);
    input.value = newValue || '0';
    
    // Set cursor position after deletion
    input.setSelectionRange(start, start);
  }
}

// Function to select all text
function selectAllCalculator() {
  const input = document.getElementById('calculatorInput');
  input.focus();
  input.select();
}

// Function to handle text selection with Shift + Arrow keys
function handleTextSelection(direction) {
  const input = document.getElementById('calculatorInput');
  const currentStart = input.selectionStart;
  const currentEnd = input.selectionEnd;
  const textLength = input.value.length;
  
  let newStart = currentStart;
  let newEnd = currentEnd;
  
  // If no selection exists, start selection from current cursor position
  if (currentStart === currentEnd) {
    switch (direction) {
      case 'left':
        if (currentStart > 0) {
          newStart = currentStart - 1;
          newEnd = currentEnd;
        }
        break;
      case 'right':
        if (currentEnd < textLength) {
          newStart = currentStart;
          newEnd = currentEnd + 1;
        }
        break;
      case 'home':
        newStart = 0;
        newEnd = currentEnd;
        break;
      case 'end':
        newStart = currentStart;
        newEnd = textLength;
        break;
    }
  } else {
    // Selection already exists, extend it
    switch (direction) {
      case 'left':
        if (currentEnd > currentStart + 1) {
          // Shrink selection from the right
          newEnd = currentEnd - 1;
        } else if (currentStart > 0) {
          // Extend selection to the left
          newStart = currentStart - 1;
        }
        break;
      case 'right':
        if (currentStart < currentEnd - 1) {
          // Shrink selection from the left
          newStart = currentStart + 1;
        } else if (currentEnd < textLength) {
          // Extend selection to the right
          newEnd = currentEnd + 1;
        }
        break;
      case 'home':
        newStart = 0;
        newEnd = currentEnd;
        break;
      case 'end':
        newStart = currentStart;
        newEnd = textLength;
        break;
    }
  }
  
  // Apply the new selection
  input.setSelectionRange(newStart, newEnd);
}

// Function to handle cursor movement with Arrow keys (without Shift)
function handleCursorMovement(direction) {
  const input = document.getElementById('calculatorInput');
  const currentStart = input.selectionStart;
  const currentEnd = input.selectionEnd;
  const textLength = input.value.length;
  
  let newPosition = currentStart;
  
  // If there's a selection, move cursor to start or end of selection
  if (currentStart !== currentEnd) {
    switch (direction) {
      case 'left':
        newPosition = currentStart;
        break;
      case 'right':
        newPosition = currentEnd;
        break;
      case 'home':
        newPosition = 0;
        break;
      case 'end':
        newPosition = textLength;
        break;
    }
  } else {
    // No selection, move cursor by one position
    switch (direction) {
      case 'left':
        newPosition = Math.max(0, currentStart - 1);
        break;
      case 'right':
        newPosition = Math.min(textLength, currentStart + 1);
        break;
      case 'home':
        newPosition = 0;
        break;
      case 'end':
        newPosition = textLength;
        break;
    }
  }
  
  // Set cursor position (no selection)
  input.setSelectionRange(newPosition, newPosition);
}

// Helper function for factorial calculation
function calculateFactorial(n) {
  if (n < 0) return NaN;
  if (n === 0 || n === 1) return 1;
  if (n > 170) return Infinity; // Prevent overflow
  
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

// Helper function to evaluate mathematical expressions with custom functions
function evaluateExpression(expression) {
  // Handle square root
  expression = expression.replace(/√\(([^)]+)\)/g, (match, contents) => {
    return `Math.sqrt(${contents})`;
  });
  
  // Handle square root for single numbers (√9 becomes Math.sqrt(9))
  expression = expression.replace(/√(\d+\.?\d*)/g, (match, number) => {
    return `Math.sqrt(${number})`;
  });
  
  // Handle factorial
  expression = expression.replace(/(\d+\.?\d*)!/g, (match, number) => {
    const num = parseFloat(number);
    if (num !== Math.floor(num) || num < 0) {
      throw new Error('Factorial only works with non-negative integers');
    }
    return calculateFactorial(num).toString();
  });
  
  return expression;
}

function calculateResult() {
  const input = document.getElementById('calculatorInput');
  try {
    let expression = input.value;
    
    // Check for balanced parentheses
    const openParens = (expression.match(/\(/g) || []).length;
    const closeParens = (expression.match(/\)/g) || []).length;
    
    if (openParens !== closeParens) {
      throw new Error('Unbalanced parentheses');
    }
    
    // Process custom mathematical functions (√ and !)
    expression = evaluateExpression(expression);
    
    // Replace × with * and ^ with ** for calculation
    expression = expression.replace(/×/g, '*');
    expression = expression.replace(/\^/g, '**');
    
    // Check for invalid expressions (ending with operators)
    if (/[+\-*\/\*\*]$/.test(expression)) {
      throw new Error('Invalid expression');
    }
    
    // Validate that expression only contains safe mathematical operations
    const allowedPattern = /^[0-9+\-*\/\(\)\.\s]*$/;
    if (!allowedPattern.test(expression.replace(/Math\.(sqrt|pow)\(/g, ''))) {
      throw new Error('Invalid characters in expression');
    }
    
    // Use Function constructor instead of eval for safer evaluation
    const result = new Function('return ' + expression)();
    
    // Handle special cases
    if (!isFinite(result)) {
      throw new Error('Invalid result');
    }
    
    // Format the result (limit decimal places for display)
    const formattedResult = Number.isInteger(result) ? 
      result.toString() : 
      parseFloat(result.toFixed(10)).toString();
    
    input.value = formattedResult;
    // Set cursor at the end of the result
    input.setSelectionRange(formattedResult.length, formattedResult.length);
  } catch (error) {
    input.value = 'Error';
    setTimeout(() => {
      input.value = '0';
      // Set cursor at the end of '0'
      input.setSelectionRange(1, 1);
    }, 1500);
  }
}

// Calculator Keyboard Support
function setupCalculatorKeyboard() {
  let keySequence = '';
  let sequenceTimeout = null;
  
  document.addEventListener('keydown', (e) => {
    // Only handle keyboard input when calculator is visible
    const calculatorTool = document.getElementById('calculatorTool');
    if (!calculatorTool || calculatorTool.style.display === 'none') {
      return;
    }

    // Check if calculator input is focused and handle Ctrl combinations specially
    const calcInput = document.getElementById('calculatorInput');
    if (calcInput === document.activeElement) {
      // Allow Ctrl+A and Ctrl+C to be handled by the calculator input's own event handler
      if (e.ctrlKey && (e.key === 'a' || e.key === 'c')) {
        return; // Don't preventDefault, let the input handler deal with it
      }
    }

    // Handle "sqrt" sequence for square root
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault(); // Prevent default to handle manually
      keySequence += e.key.toLowerCase();
      
      // Display the current sequence being typed
      const input = document.getElementById('calculatorInput');
      const currentValue = input.value;
      
      // Remove previous partial sequence if it exists
      let baseValue = currentValue;
      if (keySequence.length > 1) {
        // Remove the previous partial sequence from display
        const prevSequence = keySequence.slice(0, -1);
        if (baseValue.endsWith(prevSequence)) {
          baseValue = baseValue.slice(0, -prevSequence.length);
        }
      }
      
      // Add the new sequence to display
      if (baseValue === '0') {
        input.value = keySequence;
      } else {
        input.value = baseValue + keySequence;
      }
      
      // Add typing mode visual indicator
      input.classList.add('typing-mode');
      
      // Clear sequence after 5 seconds of inactivity (longer timeout)
      clearTimeout(sequenceTimeout);
      sequenceTimeout = setTimeout(() => {
        // Only clear if no further input has been received
        const currentInput = document.getElementById('calculatorInput');
        
        // Always clear typing mode and sequence after extended inactivity
        currentInput.classList.remove('typing-mode');
        
        // Only remove text if it's clearly an incomplete/invalid sequence
        const currentSequence = keySequence;
        if (currentInput.value.endsWith(currentSequence)) {
          // Check if it's a meaningful partial sequence
          const validPartials = ['s', 'sq', 'sqr', 'f', 'fa', 'fac', 'p', 'po'];
          
          if (!validPartials.includes(currentSequence)) {
            let newValue = currentInput.value.slice(0, -currentSequence.length);
            currentInput.value = newValue || '0';
          }
        }
        
        keySequence = '';
      }, 5000); // Much longer timeout
      
      // Check if we have complete function sequences
      if (keySequence.includes('sqrt')) {
        // Replace the typed sequence with the sqrt symbol
        const finalInput = document.getElementById('calculatorInput');
        let finalValue = finalInput.value;
        
        // Remove the "sqrt" text and replace with √
        if (finalValue.endsWith('sqrt')) {
          finalValue = finalValue.slice(0, -4); // Remove "sqrt"
          if (finalValue === '') {
            finalValue = '√';
          } else {
            finalValue += '√';
          }
          finalInput.value = finalValue;
        }
        
        // Remove typing mode and highlight button
        finalInput.classList.remove('typing-mode');
        const button = calculatorTool.querySelector(`button[onclick="appendToCalculator('√')"]`);
        if (button) {
          button.classList.add('keyboard-pressed');
          setTimeout(() => {
            button.classList.remove('keyboard-pressed');
          }, 150);
        }
        keySequence = '';
        return;
      } else if (keySequence.includes('fact')) {
        // Replace "fact" with factorial symbol
        const finalInput = document.getElementById('calculatorInput');
        let finalValue = finalInput.value;
        
        if (finalValue.endsWith('fact')) {
          finalValue = finalValue.slice(0, -4); // Remove "fact"
          if (finalValue === '' || finalValue === '0') {
            // Can't have factorial at the beginning
            finalInput.value = '0';
          } else {
            finalValue += '!';
            finalInput.value = finalValue;
          }
        }
        
        // Remove typing mode and highlight button
        finalInput.classList.remove('typing-mode');
        const button = calculatorTool.querySelector(`button[onclick="appendToCalculator('!')"]`);
        if (button) {
          button.classList.add('keyboard-pressed');
          setTimeout(() => {
            button.classList.remove('keyboard-pressed');
          }, 150);
        }
        keySequence = '';
        return;
      } else if (keySequence.includes('pow')) {
        // Replace "pow" with power symbol
        const finalInput = document.getElementById('calculatorInput');
        let finalValue = finalInput.value;
        
        if (finalValue.endsWith('pow')) {
          finalValue = finalValue.slice(0, -3); // Remove "pow"
          finalValue += '^';
          finalInput.value = finalValue;
        }
        
        // Remove typing mode and highlight button
        finalInput.classList.remove('typing-mode');
        const button = calculatorTool.querySelector(`button[onclick="appendToCalculator('^')"]`);
        if (button) {
          button.classList.add('keyboard-pressed');
          setTimeout(() => {
            button.classList.remove('keyboard-pressed');
          }, 150);
        }
        keySequence = '';
        return;
      }
      return; // Don't process further if we're building a sequence
    }

    // Prevent default behavior for calculator keys
    const calculatorKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 
                           '+', '-', '*', '/', '.', '^', '(', ')', '!', '=', 'Enter', 'Escape', 'Backspace', 'Delete', 'c', 'C'];
    
    // Check if calculator input is focused and this is a Ctrl combination or Shift+Arrow combination
    const calcInputElement = document.getElementById('calculatorInput');
    const isCtrlCombo = e.ctrlKey && (e.key === 'a' || e.key === 'c');
    const isShiftArrowCombo = e.shiftKey && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key);
    const isArrowKey = ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key);
    
    if ((calculatorKeys.includes(e.key) || e.key === 'x' || e.key === 'X' || e.key.toLowerCase().startsWith('sqrt')) && 
        !(isCtrlCombo && calcInputElement === document.activeElement) &&
        !(isShiftArrowCombo && calcInputElement === document.activeElement) &&
        !(isArrowKey && calcInputElement === document.activeElement)) {
      e.preventDefault();
    }

    // Clear typing mode if user presses a non-letter key or specific control keys
    if (keySequence !== '' && (!(/[a-zA-Z]/.test(e.key)) || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Escape')) {
      const input = document.getElementById('calculatorInput');
      
      // Check if there's selected text - if so, prioritize selection deletion over typing mode
      const hasSelection = input.selectionStart !== input.selectionEnd;
      
      // Special handling for backspace during typing mode (only if no text is selected)
      if (e.key === 'Backspace' && keySequence !== '' && !hasSelection) {
        // Remove one character from the sequence instead of clearing everything
        if (keySequence.length > 1) {
          keySequence = keySequence.slice(0, -1);
          
          // Update the display to show the reduced sequence
          let baseValue = input.value;
          
          // Find the base value without the current sequence
          if (baseValue.endsWith(keySequence + baseValue.slice(-1))) {
            baseValue = baseValue.slice(0, -(keySequence.length + 1));
          }
          
          // Add back the reduced sequence
          if (baseValue === '') {
            input.value = keySequence;
          } else {
            input.value = baseValue + keySequence;
          }
          
          // Reset the timeout for the reduced sequence
          clearTimeout(sequenceTimeout);
          sequenceTimeout = setTimeout(() => {
            const currentInput = document.getElementById('calculatorInput');
            currentInput.classList.remove('typing-mode');
            
            const currentSequence = keySequence;
            if (currentInput.value.endsWith(currentSequence)) {
              let newValue = currentInput.value.slice(0, -currentSequence.length);
              currentInput.value = newValue || '0';
            }
            
            keySequence = '';
          }, 5000);
          
          // Keep typing mode active since we still have a sequence
          return; // Don't process the backspace further
        } else {
          // Last character in sequence, clear typing mode and let normal backspace handle it
          input.classList.remove('typing-mode');
          clearTimeout(sequenceTimeout);
          keySequence = '';
          // Let the switch statement handle the backspace normally
        }
      } else {
        // For other control keys (Delete, Escape) or when text is selected, clear the typing mode completely
        input.classList.remove('typing-mode');
        
        // Clear any incomplete sequence from display only if no text is selected
        if (!hasSelection && input.value.endsWith(keySequence)) {
          let newValue = input.value.slice(0, -keySequence.length);
          input.value = newValue || '0';
        }
        
        clearTimeout(sequenceTimeout);
        keySequence = '';
        
        // For delete/escape, or when text is selected, process them normally after clearing typing mode
        // Don't return early so the switch statement can handle them
      }
    }

    // Function to highlight a button briefly
    const highlightButton = (selector) => {
      const button = calculatorTool.querySelector(selector);
      if (button) {
        button.classList.add('keyboard-pressed');
        setTimeout(() => {
          button.classList.remove('keyboard-pressed');
        }, 150);
      }
    };

    // Handle different key types
    switch (e.key) {
      // Text selection with Shift + Arrow keys
      case 'ArrowLeft':
        if (e.shiftKey) {
          e.preventDefault();
          handleTextSelection('left');
          return;
        } else {
          e.preventDefault();
          handleCursorMovement('left');
          return;
        }
        break;
      case 'ArrowRight':
        if (e.shiftKey) {
          e.preventDefault();
          handleTextSelection('right');
          return;
        } else {
          e.preventDefault();
          handleCursorMovement('right');
          return;
        }
        break;
      case 'Home':
        if (e.shiftKey) {
          e.preventDefault();
          handleTextSelection('home');
          return;
        } else {
          e.preventDefault();
          handleCursorMovement('home');
          return;
        }
        break;
      case 'End':
        if (e.shiftKey) {
          e.preventDefault();
          handleTextSelection('end');
          return;
        } else {
          e.preventDefault();
          handleCursorMovement('end');
          return;
        }
        break;
      
      // Numbers
      case '0': case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9':
        appendToCalculator(e.key);
        highlightButton(`button[onclick="appendToCalculator('${e.key}')"]`);
        break;
      
      // Operators
      case '+':
        appendToCalculator('+');
        highlightButton(`button[onclick="appendToCalculator('+')"]`);
        break;
      case '-':
        appendToCalculator('-');
        highlightButton(`button[onclick="appendToCalculator('-')"]`);
        break;
      case '*':
      case 'x':
      case 'X':
        appendToCalculator('×');
        highlightButton(`button[onclick="appendToCalculator('*')"]`);
        break;
      case '/':
        appendToCalculator('/');
        highlightButton(`button[onclick="appendToCalculator('/')"]`);
        break;
      case '.':
        appendToCalculator('.');
        highlightButton(`button[onclick="appendToCalculator('.')"]`);
        break;
      case '^':
        appendToCalculator('^');
        highlightButton(`button[onclick="appendToCalculator('^')"]`);
        break;
      case '(':
        appendToCalculator('(');
        highlightButton(`button[onclick="appendToCalculator('(')"]`);
        break;
      case ')':
        appendToCalculator(')');
        highlightButton(`button[onclick="appendToCalculator(')')"]`);
        break;
      case '!':
        appendToCalculator('!');
        highlightButton(`button[onclick="appendToCalculator('!')"]`);
        break;
      
      // Actions
      case '=':
      case 'Enter':
        calculateResult();
        highlightButton(`button[onclick="calculateResult()"]`);
        break;
      case 'Backspace':
        deleteLastCalculator();
        highlightButton(`button[onclick="deleteLastCalculator()"]`);
        break;
      case 'Delete':
        // Check if there's selected text, if so delete it, otherwise clear all
        const calcInput = document.getElementById('calculatorInput');
        if (calcInput.selectionStart !== calcInput.selectionEnd) {
          deleteSelectedText();
        } else {
          clearCalculator();
          highlightButton(`button[onclick="clearCalculator()"]`);
        }
        break;
      case 'Escape':
      case 'c':
      case 'C':
        clearCalculator();
        highlightButton(`button[onclick="clearCalculator()"]`);
        break;
    }
  });

  // Set up calculator input for selection support
  const calculatorInput = document.getElementById('calculatorInput');
  if (calculatorInput) {
    // Keep readonly to prevent direct typing, but allow selection
    calculatorInput.setAttribute('readonly', 'true');
    
    // Enable text selection and copying
    calculatorInput.style.userSelect = 'text';
    calculatorInput.style.webkitUserSelect = 'text';
    
    calculatorInput.addEventListener('keydown', (e) => {
      // Allow Ctrl+C for copying and Ctrl+A for select all
      if (e.ctrlKey && (e.key === 'c' || e.key === 'a')) {
        if (e.key === 'a') {
          e.preventDefault();
          selectAllCalculator();
        }
        return; // Allow copy operation
      }
      e.preventDefault(); // Prevent all other direct typing in the input field
    });
    
    calculatorInput.addEventListener('focus', () => {
      // Show keyboard shortcuts hint only on non-mobile devices
      const isMobile = document.body.classList.contains('mobile-android') || 
                      document.body.classList.contains('mobile-ios') || 
                      document.body.classList.contains('mobile-device') ||
                      /Mobi|Android/i.test(navigator.userAgent);
      
      if (!isMobile) {
        showNotification('💡 Keyboard shortcuts: Numbers, +, -, *, /, ^, sqrt, fact, pow, !, (, ), =, Enter, Backspace, Esc/C, Ctrl+C to copy, Ctrl+A to select all, Shift+Arrow to select text', 'info');
      }
      
      // Prevent automatic text selection on focus by setting cursor to end
      setTimeout(() => {
        const len = calculatorInput.value.length;
        calculatorInput.setSelectionRange(len, len);
      }, 0);
    });
    
    // Prevent automatic selection when clicking (some browsers auto-select readonly inputs)
    calculatorInput.addEventListener('mouseup', (e) => {
      // Only prevent auto-selection if it wasn't an intentional drag selection
      if (e.detail === 1) { // Single click, not double/triple click
        setTimeout(() => {
          if (calculatorInput.selectionStart === 0 && calculatorInput.selectionEnd === calculatorInput.value.length) {
            // All text was auto-selected, move cursor to end instead
            const len = calculatorInput.value.length;
            calculatorInput.setSelectionRange(len, len);
          }
        }, 0);
      }
    });
    
    // Add Ctrl+C copy functionality
    calculatorInput.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'c') {
        navigator.clipboard.writeText(calculatorInput.value).then(() => {
          showNotification('📋 Result copied to clipboard!', 'success');
        }).catch(() => {
          // Fallback for older browsers
          calculatorInput.select();
          document.execCommand('copy');
          showNotification('📋 Result copied to clipboard!', 'success');
        });
      }
    });
  }
}

// Notepad Functions
function saveNote() {
  const content = document.getElementById('notepadText').value;
  if (!content.trim()) {
    showNotification('Nothing to save! 📝', 'warning');
    return;
  }
  
  // Prompt for filename
  const filename = prompt('Enter filename:', 'my-note');
  if (!filename) {
    showNotification('Save cancelled! ❌', 'info');
    return;
  }
  
  // Save to localStorage with filename
  const timestamp = new Date().toISOString();
  const fileData = {
    content: content,
    filename: filename,
    timestamp: timestamp
  };
  
  // Get existing saved files
  const savedFiles = JSON.parse(localStorage.getItem('notepad_saved_files') || '[]');
  
  // Check if filename already exists
  const existingIndex = savedFiles.findIndex(file => file.filename === filename);
  if (existingIndex !== -1) {
    if (!confirm(`File "${filename}" already exists. Overwrite?`)) {
      showNotification('Save cancelled! ❌', 'info');
      return;
    }
    savedFiles[existingIndex] = fileData;
  } else {
    savedFiles.push(fileData);
  }
  
  // Save updated files list
  localStorage.setItem('notepad_saved_files', JSON.stringify(savedFiles));
  
  // Also save current content for auto-restore
  localStorage.setItem('notepad_content', content);
  
  showNotification(`File "${filename}" saved! 💾`, 'success');
  updateSavedFilesList();
}

function clearNote() {
  if (confirm('Are you sure you want to clear all text?')) {
    document.getElementById('notepadText').value = '';
    localStorage.removeItem('notepad_content');
    showNotification('Note cleared! 🗑️', 'info');
  }
}

function downloadNote() {
  const content = document.getElementById('notepadText').value;
  if (!content.trim()) {
    showNotification('Nothing to download! 📝', 'warning');
    return;
  }
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'note.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  showNotification('Note downloaded! 📥', 'success');
}

function loadNotepadContent() {
  const savedContent = localStorage.getItem('notepad_content');
  if (savedContent) {
    document.getElementById('notepadText').value = savedContent;
  }
  updateSavedFilesList();
}

function updateSavedFilesList() {
  const savedFiles = JSON.parse(localStorage.getItem('notepad_saved_files') || '[]');
  const filesList = document.getElementById('savedFilesList');
  
  if (!filesList) return; // Element doesn't exist yet
  
  if (savedFiles.length === 0) {
    filesList.innerHTML = '<p class="no-files">No saved files</p>';
    return;
  }
  
  filesList.innerHTML = savedFiles.map((file, index) => `
    <div class="saved-file-item">
      <div class="file-info">
        <strong>${file.filename}</strong>
        <small>${new Date(file.timestamp).toLocaleString()}</small>
      </div>
      <div class="file-actions">
        <button class="btn btn-small" onclick="loadFile('${file.filename.replace(/'/g, "\\'")}')">📂 Load</button>
        <button class="btn btn-small" onclick="downloadFile('${file.filename.replace(/'/g, "\\'")}')">📥 Download</button>
        <button class="btn btn-small btn-danger" onclick="deleteFile('${file.filename.replace(/'/g, "\\'")}')">🗑️ Delete</button>
      </div>
    </div>
  `).join('');
}

function loadFile(filename) {
  console.log('📂 Loading file:', filename);
  const savedFiles = JSON.parse(localStorage.getItem('notepad_saved_files') || '[]');
  const file = savedFiles.find(f => f.filename === filename);
  
  if (file) {
    document.getElementById('notepadText').value = file.content;
    // Also save as current content for auto-restore
    localStorage.setItem('notepad_content', file.content);
    showNotification(`File "${filename}" loaded! 📂`, 'success');
    console.log('✅ File loaded successfully:', filename);
  } else {
    showNotification('File not found! ❌', 'error');
    console.error('❌ File not found:', filename);
  }
}

function downloadFile(filename) {
  console.log('📥 Downloading file:', filename);
  const savedFiles = JSON.parse(localStorage.getItem('notepad_saved_files') || '[]');
  const file = savedFiles.find(f => f.filename === filename);
  
  if (file) {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showNotification(`File "${filename}" downloaded! 📥`, 'success');
    console.log('✅ File downloaded successfully:', filename);
  } else {
    showNotification('File not found! ❌', 'error');
    console.error('❌ File not found for download:', filename);
  }
}

function deleteFile(filename) {
  console.log('🗑️ Attempting to delete file:', filename);
  if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
    console.log('❌ Delete cancelled by user');
    return;
  }
  
  const savedFiles = JSON.parse(localStorage.getItem('notepad_saved_files') || '[]');
  const originalLength = savedFiles.length;
  const filteredFiles = savedFiles.filter(f => f.filename !== filename);
  
  if (filteredFiles.length < originalLength) {
    localStorage.setItem('notepad_saved_files', JSON.stringify(filteredFiles));
    showNotification(`File "${filename}" deleted! 🗑️`, 'info');
    updateSavedFilesList();
    console.log('✅ File deleted successfully:', filename);
  } else {
    showNotification('File not found! ❌', 'error');
    console.error('❌ File not found for deletion:', filename);
  }
}

// Timer Functions
let timerInterval = null;
let stopwatchInterval = null;
let stopwatchTime = 0;
let lapCounter = 1;

function initializeTimer() {
  // Switch to timer tab by default
  switchTimerTab('timer');
}

function switchTimerTab(tab) {
  const timerTab = document.getElementById('timerTab');
  const stopwatchTab = document.getElementById('stopwatchTab');
  const timerSection = document.getElementById('timerSection');
  const stopwatchSection = document.getElementById('stopwatchSection');
  
  if (tab === 'timer') {
    timerTab.classList.add('active');
    stopwatchTab.classList.remove('active');
    timerSection.style.display = 'block';
    stopwatchSection.style.display = 'none';
  } else {
    timerTab.classList.remove('active');
    stopwatchTab.classList.add('active');
    timerSection.style.display = 'none';
    stopwatchSection.style.display = 'block';
  }
}

function startTimer() {
  const minutes = parseInt(document.getElementById('timerMinutes').value) || 0;
  const seconds = parseInt(document.getElementById('timerSeconds').value) || 0;
  let totalSeconds = minutes * 60 + seconds;
  
  if (totalSeconds <= 0) {
    showNotification('Please set a valid time! ⏰', 'warning');
    return;
  }
  
  const startBtn = document.getElementById('startTimer');
  startBtn.disabled = true;
  startBtn.textContent = 'Running...';
  
  timerInterval = setInterval(() => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    document.getElementById('timerDisplay').textContent = 
      `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    if (totalSeconds <= 0) {
      clearInterval(timerInterval);
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
      showNotification('Timer finished! ⏰', 'success');
      // Play a sound notification if possible
      if (window.AudioContext || window.webkitAudioContext) {
        playTimerSound();
      }
      return;
    }
    totalSeconds--;
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  const startBtn = document.getElementById('startTimer');
  startBtn.disabled = false;
  startBtn.textContent = 'Start';
}

function resetTimer() {
  clearInterval(timerInterval);
  const startBtn = document.getElementById('startTimer');
  startBtn.disabled = false;
  startBtn.textContent = 'Start';
  document.getElementById('timerDisplay').textContent = '05:00';
  document.getElementById('timerMinutes').value = 5;
  document.getElementById('timerSeconds').value = 0;
}

function startStopwatch() {
  const startBtn = document.getElementById('startStopwatch');
  
  if (startBtn.textContent === 'Start') {
    startBtn.textContent = 'Stop';
    stopwatchInterval = setInterval(() => {
      stopwatchTime++;
      updateStopwatchDisplay();
    }, 10); // 10ms precision
  } else {
    startBtn.textContent = 'Start';
    clearInterval(stopwatchInterval);
  }
}

function lapStopwatch() {
  if (stopwatchInterval) {
    const lapTime = formatStopwatchTime(stopwatchTime);
    const lapDiv = document.createElement('div');
    lapDiv.className = 'lap-time';
    lapDiv.innerHTML = `<span>Lap ${lapCounter}</span><span>${lapTime}</span>`;
    document.getElementById('lapTimes').appendChild(lapDiv);
    lapCounter++;
  }
}

function resetStopwatch() {
  clearInterval(stopwatchInterval);
  stopwatchTime = 0;
  lapCounter = 1;
  document.getElementById('startStopwatch').textContent = 'Start';
  updateStopwatchDisplay();
  document.getElementById('lapTimes').innerHTML = '';
}

function updateStopwatchDisplay() {
  document.getElementById('stopwatchDisplay').textContent = formatStopwatchTime(stopwatchTime);
}

function formatStopwatchTime(time) {
  const minutes = Math.floor(time / 6000);
  const seconds = Math.floor((time % 6000) / 100);
  const centiseconds = time % 100;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${centiseconds.toString().padStart(2, '0')}`;
}

function playTimerSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.log('Could not play timer sound:', error);
  }
}

// Add event listeners for timer functionality
document.addEventListener('DOMContentLoaded', function() {
  // Timer tab switching
  document.getElementById('timerTab')?.addEventListener('click', () => switchTimerTab('timer'));
  document.getElementById('stopwatchTab')?.addEventListener('click', () => switchTimerTab('stopwatch'));
  
  // Timer controls
  document.getElementById('startTimer')?.addEventListener('click', startTimer);
  document.getElementById('pauseTimer')?.addEventListener('click', pauseTimer);
  document.getElementById('resetTimer')?.addEventListener('click', resetTimer);
  
  // Stopwatch controls
  document.getElementById('startStopwatch')?.addEventListener('click', startStopwatch);
  document.getElementById('lapStopwatch')?.addEventListener('click', lapStopwatch);
  document.getElementById('resetStopwatch')?.addEventListener('click', resetStopwatch);
});

// Make calculator functions globally available for onclick handlers
window.initializeCalculator = initializeCalculator;
window.clearCalculator = clearCalculator;
window.calculateResult = calculateResult;
window.appendToCalculator = appendToCalculator;
window.deleteLastCalculator = deleteLastCalculator;
window.deleteSelectedText = deleteSelectedText;
window.selectAllCalculator = selectAllCalculator;
window.handleTextSelection = handleTextSelection;
window.handleCursorMovement = handleCursorMovement;
window.calculateFactorial = calculateFactorial;
window.evaluateExpression = evaluateExpression;

// Make notepad functions globally available for onclick handlers
window.saveNote = saveNote;
window.clearNote = clearNote;
window.downloadNote = downloadNote;

// Floating Chatbot Setup
function setupFloatingChatbot() {
  console.log('🤖 Setting up floating chatbot...');
  
  const chatbotToggle = document.getElementById('chatbotToggle');
  const floatingChatbot = document.getElementById('floatingChatbot');
  const chatbotFullscreen = document.getElementById('chatbotFullscreen');
  const clearChatSmall = document.getElementById('clearChatSmall');
  const closeChatbot = document.getElementById('closeChatbot');
  
  console.log('🤖 Elements found:', {
    toggle: !!chatbotToggle,
    chatbot: !!floatingChatbot,
    fullscreen: !!chatbotFullscreen,
    clear: !!clearChatSmall,
    close: !!closeChatbot
  });
  
  if (!chatbotToggle || !floatingChatbot) {
    console.error('🤖 Required chatbot elements not found!');
    return;
  }
  
  let isFullscreen = false;
  
  // Test if toggle is visible and clickable
  console.log('🤖 Toggle element style:', {
    display: window.getComputedStyle(chatbotToggle).display,
    position: window.getComputedStyle(chatbotToggle).position,
    zIndex: window.getComputedStyle(chatbotToggle).zIndex
  });
  
  // Toggle chatbot visibility
  chatbotToggle.addEventListener('click', () => {
    console.log('🤖 Chatbot toggle clicked');
    
    // Check if chatbot is currently visible
    const isVisible = floatingChatbot.classList.contains('open');
    
    if (isVisible) {
      // Hide chatbot
      floatingChatbot.classList.remove('open');
      const toggleIcon = chatbotToggle.querySelector('.toggle-icon');
      if (toggleIcon) toggleIcon.textContent = '🤖';
      console.log('🤖 Chatbot hidden');
    } else {
      // Show chatbot
      floatingChatbot.classList.add('open');
      const toggleIcon = chatbotToggle.querySelector('.toggle-icon');
      if (toggleIcon) toggleIcon.textContent = '×';
      console.log('🤖 Chatbot shown');
      
      // Initialize chatbot when first opened
      if (!chatbotInitialized) {
        console.log('🤖 Initializing chatbot for first time');
        initializeChatbot();
      }
    }
  });
  
  // Fullscreen toggle
  chatbotFullscreen.addEventListener('click', () => {
    if (isFullscreen) {
      // Exit fullscreen
      floatingChatbot.classList.remove('fullscreen');
      chatbotFullscreen.textContent = '⛶';
      isFullscreen = false;
    } else {
      // Enter fullscreen
      floatingChatbot.classList.add('fullscreen');
      chatbotFullscreen.textContent = '🗗';
      isFullscreen = true;
    }
  });

  // Clear chat (small button)
  clearChatSmall.addEventListener('click', () => {
    if (confirm('Clear chat history?')) {
      clearChatHistory();
      showNotification('Chat cleared! 🗑️', 'info');
    }
  });

  // Close chatbot button
  if (closeChatbot) {
    closeChatbot.addEventListener('click', () => {
      console.log('🤖 Close button clicked');
      floatingChatbot.classList.remove('open');
      const toggleIcon = chatbotToggle.querySelector('.toggle-icon');
      if (toggleIcon) toggleIcon.textContent = '💬';
      console.log('🤖 Chatbot closed via close button');
    });
  }

  // Close chatbot when clicking outside (but not in fullscreen mode)
  document.addEventListener('click', (event) => {
    const isVisible = floatingChatbot.style.display === 'flex';
    
    // Only close if chatbot is visible and not in fullscreen
    if (isVisible && !isFullscreen) {
      // Check if the click was outside the chatbot and toggle button
      const isClickInside = floatingChatbot.contains(event.target) || 
                           chatbotToggle.contains(event.target);
      
      if (!isClickInside) {
        // Close the chatbot
        floatingChatbot.style.display = 'none';
        chatbotToggle.querySelector('.toggle-icon').textContent = '💬';
        console.log('🤖 Chatbot closed by clicking outside');
      }
    }
  });

  console.log('🤖 Floating chatbot setup completed');
}

// AI Chatbot Functionality
let chatHistory = [];
let isWaitingForResponse = false;
let currentProvider = 'googlestudio'; // Default to Google Studio
let currentModel = 'gemini'; // Track specific model being used
let chatbotInitialized = false; // Flag to prevent multiple initializations

// Your API keys (obfuscated to make them less obvious)
const API_KEYS = {
  googlestudio: atob('QUl6YVN5QWxJVmFDVkRqVDBqaWItTWRzYUFnbUdNWDd3bzREVklN'), // Base64 encoded
  huggingface: atob('aGZfcEV6TENJdmpjREZ0dEVkcm9ZbmtCdnNMb0tidXVHQ01jQg==') // Base64 encoded
};

// Global function to update send button state
function updateSendButtonState() {
  const sendButton = document.getElementById('sendMessage');
  const chatInput = document.getElementById('chatInput');
  
  if (!sendButton || !chatInput) return;
  
  // Since API keys are hardcoded, only check if message exists and not waiting
  sendButton.disabled = !chatInput.value.trim() || isWaitingForResponse;
}

// Function to get AI avatar based on current provider and model
function getAIAvatar() {
  // Check specific model first for more precise icons
  if (currentModel === 'deepseek' || currentModel === 'deepseek-r1') {
    return '🐋'; // DeepSeek whale icon
  } else if (currentModel === 'gemini') {
    return '💎'; // Google diamond icon
  } else if (currentModel === 'glm') {
    return '🌟'; // GLM star icon
  }
  
  // Then check provider for general icons
  switch (currentProvider) {
    case 'googlestudio':
      return '🤖'; // Google Gemini diamond
    case 'huggingface':
      return '🤖'; // Hugging Face emoji
    default:
      return '🤖'; // Default robot
  }
}

// Smooth auto-scroll function with user scroll detection
let isUserScrolling = false;
let autoScrolling = false;

function smoothScrollToBottom(container, duration = 300) {
  if (!container || isUserScrolling) return;
  
  const startScrollTop = container.scrollTop;
  const targetScrollTop = container.scrollHeight - container.clientHeight;
  const distance = targetScrollTop - startScrollTop;
  
  if (Math.abs(distance) < 5) {
    // If already at bottom, no need to scroll
    return;
  }
  
  autoScrolling = true;
  const startTime = performance.now();
  
  function animateScroll() {
    if (isUserScrolling) {
      autoScrolling = false;
      return;
    }
    
    const currentTime = performance.now();
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Smooth easing function (ease-out)
    const easeOut = 1 - Math.pow(1 - progress, 3);
    
    container.scrollTop = startScrollTop + (distance * easeOut);
    
    if (progress < 1) {
      requestAnimationFrame(animateScroll);
    } else {
      autoScrolling = false;
    }
  }
  
  requestAnimationFrame(animateScroll);
}

// Detect user scrolling to stop auto-scroll
function setupScrollDetection() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  let scrollTimeout;
  
  chatMessages.addEventListener('scroll', () => {
    if (!autoScrolling) {
      isUserScrolling = true;
      
      // Clear previous timeout
      clearTimeout(scrollTimeout);
      
      // Reset user scrolling flag after a delay
      scrollTimeout = setTimeout(() => {
        // Check if user is near bottom (within 50px)
        const isNearBottom = chatMessages.scrollTop >= 
          (chatMessages.scrollHeight - chatMessages.clientHeight - 50);
        
        if (isNearBottom) {
          isUserScrolling = false;
        }
      }, 1000);
    }
  });
  
  // Reset scrolling flag when user reaches bottom
  chatMessages.addEventListener('scroll', () => {
    const isAtBottom = chatMessages.scrollTop >= 
      (chatMessages.scrollHeight - chatMessages.clientHeight - 5);
    
    if (isAtBottom) {
      isUserScrolling = false;
    }
  });
}

function initializeChatbot() {
  // Prevent multiple initializations
  if (chatbotInitialized) {
    console.log('🤖 Chatbot already initialized, skipping...');
    return;
  }
  
  const chatInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('sendMessage');
  
  // Set default provider to Google Studio (free and reliable)
  currentProvider = 'googlestudio';
  
  // Setup scroll detection for auto-scroll stopping
  setupScrollDetection();
  
  // Hide API key section since we're using hardcoded keys
  const apiKeySection = document.getElementById('apiKeySection');
  if (apiKeySection) {
    apiKeySection.style.display = 'none';
  }
  
  // Auto-resize chat input and update button state
  const handleInputChange = function() {
    // Don't auto-resize the textarea - keep it at fixed height
    // Just update the button state
    updateSendButtonState();
  };

  // Handle paste events to trigger resize
  const handlePaste = function(e) {
    setTimeout(() => {
      handleInputChange.call(this);
    }, 0);
  };
  
  // Function to insert text at cursor position
  function insertAtCursor(el, text) {
    console.log('🎯 insertAtCursor called with text:', JSON.stringify(text));
    el.focus();
    if (typeof el.selectionStart == "number" && typeof el.selectionEnd == "number") {
      const val = el.value;
      const selStart = el.selectionStart;
      console.log('📍 Cursor position:', selStart, 'of', val.length, 'characters');
      el.value = val.slice(0, selStart) + text + val.slice(el.selectionEnd);
      el.selectionEnd = el.selectionStart = selStart + text.length;
      console.log('✅ Text inserted successfully, new cursor position:', el.selectionStart);
    } else if (typeof document.selection != "undefined") {
      console.log('🔄 Using legacy IE method');
      const textRange = document.selection.createRange();
      textRange.text = text;
      textRange.collapse(false);
      textRange.select();
    }
  }

  // Handle Shift+Enter for new lines
  const handleShiftEnter = function(e) {
    console.log('🔍 keydown event:', e.key, 'shiftKey:', e.shiftKey, 'type:', e.type);
    if (e.key === 'Enter' && e.shiftKey) {
      console.log('✅ Shift+Enter detected, inserting newline');
      e.preventDefault();
      
      // Insert newline at cursor position
      const start = this.selectionStart;
      const end = this.selectionEnd;
      const value = this.value;
      
      this.value = value.substring(0, start) + '\n' + value.substring(end);
      this.selectionStart = this.selectionEnd = start + 1;
      
      console.log('📝 Newline inserted at cursor position');
      
      // Update button state
      updateSendButtonState();
    }
  };

  // Send message on Enter (but allow Shift+Enter for new lines)
  const handleKeyDown = function(e) {
    console.log('🔍 keydown event:', e.key, 'shiftKey:', e.shiftKey, 'type:', e.type);
    
    // Handle Shift+Enter first (for new lines)
    if (e.key === 'Enter' && e.shiftKey) {
      console.log('✅ Shift+Enter detected, inserting newline');
      e.preventDefault();
      
      // Insert newline at cursor position
      const start = this.selectionStart;
      const end = this.selectionEnd;
      const value = this.value;
      
      this.value = value.substring(0, start) + '\n' + value.substring(end);
      this.selectionStart = this.selectionEnd = start + 1;
      
      console.log('📝 Newline inserted at cursor position');
      
      // Update button state
      updateSendButtonState();
      return;
    }
    
    // Handle Enter alone (for sending)
    if (e.key === 'Enter' && !e.shiftKey) {
      console.log('📤 Enter alone detected, sending message');
      e.preventDefault();
      if (!sendButton.disabled) {
        sendMessage();
      }
    }
  };
  
  // Remove existing listeners to prevent duplicates
  chatInput.removeEventListener('input', handleInputChange);
  chatInput.removeEventListener('keydown', handleKeyDown);
  chatInput.removeEventListener('paste', handlePaste);
  sendButton.removeEventListener('click', sendMessage);
  
  // Add event listeners
  chatInput.addEventListener('input', handleInputChange);
  chatInput.addEventListener('keydown', handleKeyDown);
  chatInput.addEventListener('paste', handlePaste);
  sendButton.addEventListener('click', sendMessage);
  
  // Load chat history
  loadChatHistory();
  
  // Mark as initialized to prevent double initialization
  chatbotInitialized = true;
  
  console.log('🤖 Chatbot initialized successfully with hardcoded API keys');
  console.log('🎯 Event listeners attached to:', chatInput.id);
  
  // Add a test function to window for debugging
  window.testShiftEnter = function() {
    console.log('🧪 Testing Shift+Enter functionality');
    console.log('📋 Input element:', chatInput);
    console.log('🎪 Event listeners should be attached');
    chatInput.focus();
    console.log('👆 Input focused, try pressing Shift+Enter now');
  };
}

// Model Command Detection and Execution
function checkForModelCommand(message) {
  const lowerMessage = message.toLowerCase();
  
  // Define model command patterns
  const modelCommands = {
    // DeepSeek models
    'deepseek': ['use deepseek', 'switch to deepseek', 'deepseek model', 'change to deepseek', 'deepseek-r1'],
    'deepseek-r1': ['use deepseek-r1', 'switch to deepseek-r1', 'deepseek r1', 'change to deepseek-r1'],
    
    // Other models
    'gpt2': ['use gpt2', 'switch to gpt2', 'gpt-2', 'openai gpt2', 'change to gpt2'],
    'glm': ['use glm', 'switch to glm', 'glm-4.5', 'change to glm'],
    'dialoglpt': ['use dialoglpt', 'switch to dialoglpt', 'dialog gpt', 'change to dialoglpt'],
    'zephyr': ['use zephyr', 'switch to zephyr', 'zephyr-7b', 'change to zephyr'],
    'llama': ['use llama', 'switch to llama', 'llama-2', 'change to llama'],
    'mixtral': ['use mixtral', 'switch to mixtral', 'mixtral-8x7b', 'change to mixtral'],
    
    // Provider switching
    'google': ['use google', 'switch to google', 'google studio', 'change to google', 'gemini'],
    'huggingface': ['use huggingface', 'switch to huggingface', 'hugging face', 'change to huggingface', 'hf'],
  };
  
  // Check each model command
  for (const [model, patterns] of Object.entries(modelCommands)) {
    for (const pattern of patterns) {
      if (lowerMessage.includes(pattern)) {
        return model;
      }
    }
  }
  
  return null;
}

function executeModelSwitch(modelCommand, originalMessage) {
  console.log('🔄 Executing model switch:', modelCommand);
  
  let responseMessage = '';
  let currentModel = '';
  
  try {
    switch (modelCommand) {
      case 'deepseek':
      case 'deepseek-r1':
        currentProvider = 'huggingface';
        currentModel = 'deepseek-ai/DeepSeek-R1';
        responseMessage = `✅ Switched to DeepSeek-R1 model! 🧠 This model excels at reasoning and complex problem-solving. All future messages will use DeepSeek-R1.`;
        break;
        
      case 'gpt2':
        currentProvider = 'huggingface';
        currentModel = 'openai-community/gpt2';
        responseMessage = `✅ Switched to GPT-2 model! 🤖 This is the classic OpenAI model. All future messages will use GPT-2.`;
        break;
        
      case 'glm':
        currentProvider = 'huggingface';
        currentModel = 'zai-org/GLM-4.5';
        responseMessage = `✅ Switched to GLM-4.5 model! 🚀 This is a powerful Chinese-English bilingual model. All future messages will use GLM-4.5.`;
        break;
        
      case 'dialoglpt':
        currentProvider = 'huggingface';
        currentModel = 'microsoft/DialoGPT-medium';
        responseMessage = `✅ Switched to DialoGPT model! 💬 This model is optimized for conversational responses. All future messages will use DialoGPT.`;
        break;
        
      case 'zephyr':
        currentProvider = 'huggingface';
        currentModel = 'HuggingFaceH4/zephyr-7b-beta';
        responseMessage = `✅ Switched to Zephyr-7B model! ⚡ This is a fine-tuned instruction-following model. All future messages will use Zephyr-7B.`;
        break;
        
      case 'llama':
        currentProvider = 'huggingface';
        currentModel = 'meta-llama/Llama-2-7b-chat-hf';
        responseMessage = `✅ Switched to Llama-2 model! 🦙 This is Meta's powerful chat model. All future messages will use Llama-2.`;
        break;
        
      case 'mixtral':
        currentProvider = 'huggingface';
        currentModel = 'mistralai/Mixtral-8x7B-Instruct-v0.1';
        responseMessage = `✅ Switched to Mixtral model! 🌟 This is a high-performance mixture-of-experts model. All future messages will use Mixtral.`;
        break;
        
      case 'google':
        currentProvider = 'googlestudio';
        currentModel = 'gemini-1.5-flash';
        responseMessage = `✅ Switched to Google Gemini! 🧠 Using Google's Gemini 1.5 Flash model. All future messages will use Google Studio API.`;
        break;
        
      case 'huggingface':
        currentProvider = 'huggingface';
        currentModel = 'auto'; // Will use the priority list
        responseMessage = `✅ Switched to Hugging Face models! 🤗 Will try models in priority order starting with DeepSeek-R1. All future messages will use Hugging Face API.`;
        break;
        
      default:
        responseMessage = `❓ I recognized "${modelCommand}" but I'm not sure how to switch to that model yet.`;
        break;
    }
    
    // Store the preferred model for Hugging Face provider
    if (currentProvider === 'huggingface' && currentModel && currentModel !== 'auto') {
      localStorage.setItem('preferred_hf_model', currentModel);
      console.log('💾 Saved preferred model:', currentModel);
    }
    
    // Add response message to chat
    setTimeout(() => {
      addMessageToChat(responseMessage, 'assistant');
      console.log(`🔄 Model switched to: ${currentProvider} (${currentModel})`);
    }, 500);
    
  } catch (error) {
    console.error('❌ Error switching model:', error);
    addMessageToChat('❌ Sorry, I had trouble switching models. Please try again.', 'assistant');
  }
}

// App Command Detection and Execution
function checkForAppCommand(message) {
  const lowerMessage = message.toLowerCase();
  
  // Define app command patterns
  const appCommands = {
    // Games
    'snake': ['open snake', 'snake game', 'play snake', 'start snake', 'launch snake'],
    'memory': ['open memory', 'memory game', 'play memory', 'start memory', 'launch memory', 'matching game'],
    'tictactoe': ['open tic tac toe', 'tic tac toe', 'play tic tac toe', 'start tic tac toe', 'launch tic tac toe', 'open ttt', 'play ttt'],
    
    // Tools
    'calculator': ['open calculator', 'calculator', 'calc', 'open calc', 'launch calculator'],
    'notepad': ['open notepad', 'notepad', 'notes', 'open notes', 'text editor', 'launch notepad'],
    'timer': ['open timer', 'timer', 'stopwatch', 'open stopwatch', 'launch timer'],
    
    // Navigation
    'home': ['go home', 'home page', 'main menu', 'dashboard', 'go to home'],
    'games': ['show games', 'games menu', 'all games', 'game list'],
    'tools': ['show tools', 'tools menu', 'all tools', 'tool list']
  };
  
  // Check each command
  for (const [command, patterns] of Object.entries(appCommands)) {
    for (const pattern of patterns) {
      if (lowerMessage.includes(pattern)) {
        return command;
      }
    }
  }
  
  return null;
}

function executeAppCommand(command, originalMessage) {
  console.log('🚀 Executing app command:', command);
  
  let responseMessage = '';
  let success = false;
  
  try {
    switch (command) {
      case 'snake':
        navigateToSection('snake-game');
        responseMessage = '🐍 Opening Snake Game! Use arrow keys or swipe to control the snake. Good luck!';
        success = true;
        break;
        
      case 'memory':
        navigateToSection('memory-game');
        responseMessage = '🧠 Opening Memory Game! Click cards to match pairs. Player 1 vs Player 2 - let the fun begin!';
        success = true;
        break;
        
      case 'tictactoe':
        navigateToSection('tic-tac-toe');
        responseMessage = '⭕ Opening Tic Tac Toe! Choose your game mode and start playing!';
        success = true;
        break;
        
      case 'calculator':
        navigateToSection('calculator');
        responseMessage = '🔢 Opening Calculator! Ready for some math calculations!';
        success = true;
        break;
        
      case 'notepad':
        navigateToSection('notepad');
        responseMessage = '📝 Opening Notepad! Start writing your notes, save them, and manage your files!';
        success = true;
        break;
        
      case 'timer':
        navigateToSection('timer');
        responseMessage = '⏰ Opening Timer & Stopwatch! Set timers or track time with the stopwatch!';
        success = true;
        break;
        
      case 'home':
        navigateToSection('home');
        responseMessage = '🏠 Welcome back to the home page! What would you like to do next?';
        success = true;
        break;
        
      case 'games':
        navigateToSection('games');
        responseMessage = '🎮 Here are all the available games! Choose one to start playing!';
        success = true;
        break;
        
      case 'tools':
        navigateToSection('tools');
        responseMessage = '🛠️ Here are all the available tools! Pick one that suits your needs!';
        success = true;
        break;
        
      default:
        responseMessage = `❓ I understood you want to open "${command}" but I'm not sure how to do that yet.`;
        break;
    }
    
    // Add response message to chat
    setTimeout(() => {
      addMessageToChat(responseMessage, 'assistant');
      if (success) {
        // Show additional helpful message
        setTimeout(() => {
          addMessageToChat('💡 You can also say things like "open calculator", "play snake", or "show tools" to navigate quickly!', 'assistant');
        }, 1000);
      }
    }, 500);
    
  } catch (error) {
    console.error('❌ Error executing app command:', error);
    addMessageToChat('❌ Sorry, I had trouble opening that app. Please try again or use the navigation menu.', 'assistant');
  }
}

async function sendMessage() {
  const chatInput = document.getElementById('chatInput');
  const message = chatInput.value.trim();
  
  // Prevent multiple calls and empty messages
  if (!message) {
    console.log('🚫 SendMessage blocked: Empty message');
    return;
  }
  
  if (isWaitingForResponse) {
    console.log('🚫 SendMessage blocked: Already waiting for response - preventing duplicate call');
    return;
  }

  // Check for app opening commands first
  const appCommand = checkForAppCommand(message);
  if (appCommand) {
    console.log('🎮 App command detected:', appCommand);
    
    // Add user message to chat
    addMessageToChat(message, 'user');
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    // Execute the app command
    executeAppCommand(appCommand, message);
    return; // Don't send to AI if it's an app command
  }

  // Check for model switching commands
  const modelCommand = checkForModelCommand(message);
  if (modelCommand) {
    console.log('🤖 Model switch command detected:', modelCommand);
    
    // Add user message to chat
    addMessageToChat(message, 'user');
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    // Execute the model switch
    executeModelSwitch(modelCommand, message);
    return; // Don't send to AI if it's a model command
  }

  // Set waiting state immediately to prevent double calls
  isWaitingForResponse = true;
  updateSendButtonState();
  
  console.log('📤 Sending message:', message, 'Provider:', currentProvider);

  // Add user message to chat
  addMessageToChat(message, 'user');
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  // Show typing indicator (will be replaced by streaming for Google Studio)
  let typingIndicator = null;
  let streamingMessage = null;
  let usedStreaming = false; // Track if streaming was used

  try {
    let response;
    
    console.log('🤖 Current provider:', currentProvider);
    console.log('🤖 Available providers: googlestudio, huggingface');
    
    if (currentProvider === 'googlestudio') {
      console.log('🧠 Calling Google Studio API with simulated streaming...');
      
      try {
        // Create streaming message instead of typing indicator
        streamingMessage = createStreamingMessage();
        
        // Get response from API
        response = await getGoogleStudioResponse(message);
        console.log('🧠 Google Studio response received:', response);
        
        // Simulate streaming by showing text progressively
        if (streamingMessage && response) {
          await simulateStreamingResponse(streamingMessage, response);
          streamingMessage = null; // Handled by streaming simulation
          usedStreaming = true; // Mark that streaming was used
        }
      } catch (googleError) {
        console.error('🧠 Google Studio API failed:', googleError);
        
        // Remove streaming message on error
        if (streamingMessage) {
          streamingMessage.remove();
          streamingMessage = null;
        }
        
        // Fallback to Hugging Face if Google Studio fails
        console.log('🔄 Falling back to Hugging Face API...');
        currentProvider = 'huggingface';
        typingIndicator = showTypingIndicator();
        response = await getHuggingFaceResponse(message);
      }
    } else if (currentProvider === 'huggingface') {
      console.log('🤗 Calling Hugging Face API with DeepSeek-R1 priority...');
      
      typingIndicator = showTypingIndicator();
      
      // Test API availability first
      const isAvailable = await testHuggingFaceAPI(API_KEYS.huggingface);
      if (!isAvailable) {
        console.log('🤗 API test failed, using enhanced local fallback');
        response = getLocalFallbackResponse(message);
      } else {
        // Try DeepSeek-R1 first, then fallback to other models
        try {
          console.log('🧠 Trying DeepSeek-R1 first...');
          response = await getDeepSeekResponse(message);
          console.log('✅ DeepSeek-R1 response successful');
        } catch (deepseekError) {
          console.log('🧠 DeepSeek-R1 failed, falling back to other Hugging Face models...');
          console.error('DeepSeek-R1 error:', deepseekError);
          response = await getHuggingFaceResponse(message);
        }
      }
    } else {
      console.error('❌ Unknown provider:', currentProvider);
      throw new Error('Unknown AI provider: ' + currentProvider);
    }
    
    console.log('✅ Got response:', response ? 'Success' : 'Empty response');
    
    // Only add message if not already handled by streaming
    if (response && !usedStreaming) {
      if (typingIndicator) removeTypingIndicator(typingIndicator);
      addMessageToChat(response, 'assistant');
    } else if (typingIndicator) {
      removeTypingIndicator(typingIndicator);
    }
    
  } catch (error) {
    // Clean up indicators
    if (typingIndicator) removeTypingIndicator(typingIndicator);
    if (streamingMessage) {
      streamingMessage.remove();
      streamingMessage = null;
    }
    
    console.error('Chatbot Error:', error);
    
    let errorMessage = 'Sorry, I encountered an error. Please try again.';
    
    if (error.message.includes('quota')) {
      errorMessage = '⚠️ API quota exceeded. Switching to fallback mode...';
      // Try switching to the other provider
      if (currentProvider === 'googlestudio') {
        currentProvider = 'huggingface';
        errorMessage += ' Switched to Hugging Face.';
      } else {
        errorMessage += ' Using local responses.';
      }
    } else if (error.message.includes('CORS')) {
      errorMessage = '🔧 CORS issue detected. Please install a CORS browser extension.';
    } else if (error.message.includes('401') || error.message.includes('unauthorized')) {
      errorMessage = '🔑 API key issue. Please contact the site administrator.';
    } else if (error.message.includes('403') || error.message.includes('forbidden')) {
      errorMessage = '🚫 API access forbidden. Please try again later.';
    } else if (error.message.includes('429')) {
      errorMessage = '⏱️ Rate limit exceeded. Please wait a moment and try again.';
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = '🌐 Network error: Unable to connect to API. Check your internet connection.';
    }
    
    addMessageToChat(errorMessage + '\n\n' + `Debug: ${error.message}`, 'assistant', true);
    showNotification('Chatbot Error: Check console for details', 'error');
  } finally {
    isWaitingForResponse = false;
    updateSendButtonState();
    chatInput.focus();
  }
}

// Google Studio API Response Function
async function getGoogleStudioResponse(message) {
  const apiKey = API_KEYS.googlestudio;
  console.log('🧠 Google Studio API called with hardcoded key');
  
  // Set current model for avatar
  currentModel = 'gemini';
  
  if (!apiKey) {
    throw new Error('No API key configured');
  }

  // Build conversation contents with history
  const contents = [];
  
  // Add conversation history (limit to last 10 exchanges to avoid token limits)
  const recentHistory = chatHistory.slice(-20); // Last 20 messages (10 exchanges)
  
  // Add system instruction for better responses (if no history exists)
  if (recentHistory.length === 0) {
    contents.push({
      role: 'user',
      parts: [{
        text: `You are a helpful AI assistant for a web app with games and tools. Be contextual and helpful:

RESPONSE STYLE:
• **Keep responses relevant** to the user's specific question
• **Answer questions fully** - provide complete, helpful answers
• **For simple greetings** - give brief, friendly responses with app shortcuts
• **For app questions** - focus on navigation and features  
• **For educational/technical topics** - provide clear, complete explanations
• **Use appropriate formatting** with emojis and bullet points
• **For mathematical content** - ALWAYS use LaTeX notation: $inline$ and $$display$$
• **Match detail level** to what the user is asking for

APP CONTEXT:
• This app has Games (Snake, Memory, Tic Tac Toe) and Tools (Calculator, Notepad, Timer)
• Users can navigate using menu buttons or by saying app names
• Focus on helping users discover and use app features
• Provide shortcuts and navigation tips when relevant

EDUCATIONAL HELP:
• Answer math, science, and educational questions completely
• Provide full explanations when users ask "how" or "why" questions
• **ALWAYS use LaTeX math formatting**: $E = mc^2$, $$\frac{d}{dx}f(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}$$
• Use examples and clear reasoning with proper mathematical notation
• Be thorough while staying focused on the question

Remember: Give complete, helpful answers with proper LaTeX math formatting!`
      }]
    });
    contents.push({
      role: 'model',
      parts: [{
        text: `Hello! 👋 I'm your AI assistant for this app.

**I can help you with:**
• 🎮 **Navigation** - Find games and tools
• 🔧 **App features** - Learn how to use different functions  
• 💬 **Questions** - Answer anything you're curious about
• 📝 **Quick help** - Get brief, relevant responses

**Try saying:** "games", "tools", "help", or ask me anything!

What would you like to do? 😊`
      }]
    });
  }
  
  // Add conversation history to contents
  for (const historyMsg of recentHistory) {
    contents.push({
      role: historyMsg.role === 'user' ? 'user' : 'model',
      parts: [{
        text: historyMsg.content
      }]
    });
  }
  
  // Add current user message with LaTeX reminder
  contents.push({
    role: 'user',
    parts: [{
      text: `${message}

[Be helpful and complete in your answers. For app navigation, focus on features and shortcuts. For educational/mathematical questions, provide full explanations with proper LaTeX formatting: $inline$ and $$display$$ math notation. Always use LaTeX for mathematical expressions.]`
    }]
  });
  
  const requestBody = {
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024
    }
  };
  
  console.log('🧠 Request body with conversation history:', JSON.stringify(requestBody, null, 2));
  console.log('🧠 Including', recentHistory.length, 'previous messages for context');
  
  // Use regular API endpoint (streaming simulation in UI)
  const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  console.log('🧠 API URL:', apiUrl);
  
  try {
    // Use simulated streaming for better UX
    return await getGoogleStudioWithSimulatedStreaming(apiUrl, requestBody);
    
  } catch (fetchError) {
    console.error('🧠 Fetch error:', fetchError);
    
    // If it's a network error, provide a fallback test response for debugging
    if (fetchError.name === 'TypeError' || fetchError.message.includes('fetch')) {
      console.log('🧠 Network error detected, this might be CORS or connectivity issue');
      throw new Error('Network error: Unable to connect to Google Studio API. This might be due to CORS restrictions or network issues.');
    }
    
    throw fetchError;
  }
}

// Simulated streaming for Google Studio (better UX)
async function getGoogleStudioWithSimulatedStreaming(apiUrl, requestBody) {
  const originalFetch = window.originalFetch || fetch;
  
  try {
    const response = await originalFetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('🧠 Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('🧠 Google Studio API error:', errorData);
      
      if (response.status === 401) {
        throw new Error('401 unauthorized - Invalid API key');
      } else if (response.status === 429) {
        throw new Error('quota exceeded');
      } else if (response.status === 403) {
        throw new Error('403 forbidden - Check API key permissions or enable Gemini API');
      } else if (response.status === 400) {
        throw new Error('400 bad request - Check if Gemini API is enabled in your Google Cloud project');
      }
      throw new Error(`Google Studio API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('🧠 API Response:', JSON.stringify(data, null, 2));
    
    // Handle Google's response format
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      const responseText = data.candidates[0].content.parts[0].text;
      console.log('🧠 Extracted response text:', responseText);
      return responseText;
    } else if (data.error) {
      throw new Error(`Google API Error: ${data.error.message}`);
    } else {
      console.warn('🧠 Unexpected response format:', data);
      throw new Error('Unexpected response format from Google Studio API');
    }
  } catch (error) {
    console.error('🧠 API error:', error);
    throw error;
  }
}

// Original streaming function (kept for future use)
async function getGoogleStudioStreamingResponse(apiUrl, requestBody) {
  const originalFetch = window.originalFetch || fetch;
  
  try {
    const response = await originalFetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('🧠 Streaming Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('🧠 Google Studio API error:', errorData);
      
      if (response.status === 401) {
        throw new Error('401 unauthorized - Invalid API key');
      } else if (response.status === 429) {
        throw new Error('quota exceeded');
      } else if (response.status === 403) {
        throw new Error('403 forbidden - Check API key permissions or enable Gemini API');
      } else if (response.status === 400) {
        throw new Error('400 bad request - Check if Gemini API is enabled in your Google Cloud project');
      }
      throw new Error(`Google Studio API error: ${response.status} - ${errorData}`);
    }

    // Check if response supports streaming
    const reader = response.body?.getReader();
    if (!reader) {
      // Fallback to non-streaming
      const data = await response.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        return data.candidates[0].content.parts[0].text;
      }
      throw new Error('No readable stream available');
    }

    console.log('🧠 Starting streaming response...');
    let fullResponse = '';
    let streamingMessageElement = null;
    
    // Create streaming message element
    streamingMessageElement = createStreamingMessage();
    
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('🧠 Streaming completed');
          break;
        }
        
        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        console.log('🧠 Received chunk:', chunk);
        
        // Parse Google's streaming format
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonData = JSON.parse(line.slice(6));
              if (jsonData.candidates && jsonData.candidates[0] && jsonData.candidates[0].content) {
                const newText = jsonData.candidates[0].content.parts[0].text;
                fullResponse += newText;
                
                // Update streaming message
                updateStreamingMessage(streamingMessageElement, fullResponse);
              }
            } catch (e) {
              console.warn('🧠 Failed to parse streaming chunk:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    // Finalize streaming message
    finalizeStreamingMessage(streamingMessageElement, fullResponse);
    
    return fullResponse || "I'm here to help! Could you please rephrase your question?";
    
  } catch (error) {
    console.error('🧠 Streaming error:', error);
    
    // Fallback to non-streaming API
    console.log('🧠 Falling back to non-streaming API...');
    const nonStreamingUrl = apiUrl.replace('streamGenerateContent', 'generateContent');
    
    const fallbackResponse = await originalFetch(nonStreamingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!fallbackResponse.ok) {
      throw new Error(`Fallback API error: ${fallbackResponse.status}`);
    }
    
    const data = await fallbackResponse.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      return data.candidates[0].content.parts[0].text;
    }
    
    throw error;
  }
}

// DeepSeek-R1 API Response Function (optimized for DeepSeek-R1 model)
async function getDeepSeekResponse(message) {
  const apiKey = API_KEYS.huggingface;
  
  // Build conversation messages optimized for DeepSeek-R1
  const messages = [];
  
  // Add system message with app-focused instructions (if no history exists)
  if (chatHistory.length === 0) {
    messages.push({
      role: 'system',
      content: `You are DeepSeek-R1, an advanced AI assistant for a web app with games and tools. Be contextual and appropriate:

PRIMARY PURPOSE:
• Help users navigate the app (Games: Snake, Memory, Tic Tac Toe; Tools: Calculator, Notepad, Timer)
• Assist with model switching ("use deepseek", "use glm", etc.)
• Answer educational and technical questions completely and clearly
• Show detailed reasoning for complex questions when helpful

RESPONSE STYLE:
• **Match response length to question complexity** - Simple greetings get simple responses!
• For basic greetings ("hi", "hello", "hey"): Give a brief, friendly response with app suggestions
• For complex questions: Be thorough and show reasoning with <think>...</think> tags
• Use appropriate formatting with emojis and bullet points
• **ALWAYS use LaTeX math notation**: $inline$ and $$display$$ for all mathematical expressions
• Format equations properly: $E = mc^2$, $$\frac{d}{dx}f(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}$$

QUESTION HANDLING:
• For simple greetings: Brief welcome with app suggestions (2-3 lines max)
• For app navigation: Focus on features and shortcuts
• For mathematical questions: Use proper LaTeX formatting for all equations and derivations
• For educational questions: Provide full, clear explanations with mathematical notation
• For technical questions: Give complete, helpful answers
• Match your response depth to what the user is asking for

Remember: Always use LaTeX math formatting for mathematical content!`
    });
  }
  
  // Add conversation history (limit for better performance)
  const recentHistory = chatHistory.slice(-6); // Last 6 messages for context
  for (const historyMsg of recentHistory) {
    messages.push({
      role: historyMsg.role,
      content: historyMsg.content
    });
  }
  
  // Add current message with contextual instructions
  const isSimpleGreeting = /^(hi|hello|hey|sup|yo)(\s+.*)?$/i.test(message.trim());
  
  let instructions;
  if (isSimpleGreeting) {
    instructions = "[Keep response brief and friendly. Just welcome and suggest app features.]";
  } else {
    instructions = "[Be helpful and complete. For app questions, focus on navigation. For mathematical/educational questions, provide full explanations with proper LaTeX formatting: $inline$ and $$display$$ math notation. Use <think> tags for complex reasoning. Always format mathematical expressions with LaTeX.]";
  }
  
  messages.push({
    role: 'user',
    content: `${message}

${instructions}`
  });
  
  console.log('🧠 DeepSeek-R1 conversation messages:', messages);
  
  try {
    console.log('🧠 Calling DeepSeek-R1 via Hugging Face Router API...');
    
    // Set current model for avatar
    currentModel = 'deepseek-r1';
    
    // Use Hugging Face Router API with DeepSeek-R1 optimized parameters
    const response = await window.originalFetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ChatBot/1.0)'
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-R1',
        messages: messages,
        max_tokens: 1000,       // Increased significantly for full responses
        temperature: 0.8,       // Optimized for creativity
        top_p: 0.9,            // Better response quality
        stream: false
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('🧠 DeepSeek-R1 API error:', response.status, errorText);
      throw new Error(`DeepSeek-R1 API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('🧠 DeepSeek-R1 response:', data);
    
    // Handle OpenAI-compatible response format
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const assistantMessage = data.choices[0].message.content;
      return assistantMessage.trim() || "I'm here to help! Could you rephrase your question?";
    } else {
      console.log('🧠 Unexpected DeepSeek-R1 response format:', data);
      throw new Error('Invalid response format from DeepSeek-R1');
    }
    
  } catch (error) {
    console.error('🧠 DeepSeek-R1 error:', error);
    throw error; // Re-throw to allow fallback to other models
  }
}

// Hugging Face API Response Function (using Router API)
async function getHuggingFaceResponse(message) {
  const apiKey = API_KEYS.huggingface;
  
  // Build conversation messages in OpenAI format
  const messages = [];
  
  // Add system message for balanced assistance (if no history exists)
  if (chatHistory.length === 0) {
    messages.push({
      role: 'system',
      content: `You are a helpful AI assistant for a web app with games and tools. Be contextual and complete:

• Focus on app navigation (games: Snake, Memory, Tic Tac Toe; tools: Calculator, Notepad, Timer)
• Help users switch models ("use deepseek", "use glm", etc.)
• Answer educational and technical questions fully and clearly
• **ALWAYS use LaTeX math formatting**: $inline$ math and $$display$$ math for equations
• Use emojis and bullet points for clarity
• Provide complete explanations when users ask "how" or "why" questions
• Match your response detail to what the user is asking for

Remember: Be helpful and thorough with proper LaTeX math notation for mathematical content!`
    });
  }
  
  // Add conversation history
  const recentHistory = chatHistory.slice(-8); // Last 8 messages for context
  for (const historyMsg of recentHistory) {
    messages.push({
      role: historyMsg.role,
      content: historyMsg.content
    });
  }
  
  // Add current message with LaTeX reminder
  messages.push({
    role: 'user',
    content: `${message}

[Be helpful and complete. For app questions, focus on navigation. For educational/mathematical questions, provide full explanations with LaTeX math formatting: $inline$ and $$display$$ notation. Always use proper mathematical notation.]`
  });
  
  console.log('🤗 Hugging Face conversation messages:', messages);
  
  // Using Hugging Face Router API with OpenAI-compatible format
  let response;
  
  // Check if user has a preferred model
  const preferredModel = localStorage.getItem('preferred_hf_model');
  
  let models;
  if (preferredModel) {
    console.log('🎯 Using preferred model:', preferredModel);
    // Put preferred model first, then fallbacks
    models = [
      preferredModel,
      'deepseek-ai/DeepSeek-R1',      // DeepSeek-R1 model (top priority)
      'zai-org/GLM-4.5',             // User requested model
      'openai-community/gpt2',        // GPT-2 model
      'microsoft/DialoGPT-medium',    // Fallback
      'HuggingFaceH4/zephyr-7b-beta', // Additional fallbacks
      'meta-llama/Llama-2-7b-chat-hf',
      'mistralai/Mixtral-8x7B-Instruct-v0.1'
    ].filter((model, index, arr) => arr.indexOf(model) === index); // Remove duplicates
  } else {
    // Default model priority
    models = [
      'deepseek-ai/DeepSeek-R1',      // DeepSeek-R1 model (top priority)
      'zai-org/GLM-4.5',             // User requested model
      'openai-community/gpt2',        // GPT-2 model
      'microsoft/DialoGPT-medium',    // Fallback
      'HuggingFaceH4/zephyr-7b-beta', // Additional fallbacks
      'meta-llama/Llama-2-7b-chat-hf',
      'mistralai/Mixtral-8x7B-Instruct-v0.1'
    ];
  }
  
  console.log('🤗 Available models to try:', models);
  
  let lastError;
  let modelUsed;
  
  for (const model of models) {
    try {
      console.log(`🤗 Trying Hugging Face model via Router API: ${model}`);
      
      // Use Hugging Face Router API (OpenAI-compatible)
      response = await window.originalFetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; ChatBot/1.0)'
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          max_tokens: 800,      // Increased for fuller responses
          temperature: 0.7,
          stream: false
        })
      });
      
      if (response.ok) {
        console.log(`✅ Successfully connected to model: ${model}`);
        modelUsed = model;
        break;
      } else {
        const errorText = await response.text();
        if (response.status === 404) {
          console.log(`❌ Model ${model} not found (404) - model may not be available on Hugging Face Router`);
        } else {
          console.log(`❌ Model ${model} failed with status: ${response.status}`, errorText);
        }
        lastError = `${model}: ${response.status} - ${errorText || 'Model not found'}`;
      }
    } catch (error) {
      console.log(`❌ Model ${model} failed with error:`, error);
      lastError = `${model}: ${error.message}`;
    }
  }

  if (!response || !response.ok) {
    if (response && response.status === 401) {
      throw new Error('401 unauthorized');
    } else if (response && response.status === 429) {
      throw new Error('quota exceeded');
    } else if (response && response.status === 503) {
      console.log('🤗 Model is loading, will use local fallback for now');
      return getLocalFallbackResponse(message);
    }
    
    // If all models failed, provide a helpful error message and local response
    console.log('🤗 All Hugging Face models failed, using enhanced local fallback');
    console.log('💡 This could be due to:');
    console.log('   - Models are currently loading (try again in a few minutes)');
    console.log('   - API key might need verification');
    console.log('   - Network connectivity issues');
    console.log('   - Models might require different access permissions');
    
    return getLocalFallbackResponse(message);
  }

  const data = await response.json();
  console.log(`🤗 Response from ${modelUsed}:`, data);
  
  // Set current model for avatar based on which model was used
  if (modelUsed.includes('deepseek') || modelUsed.includes('DeepSeek')) {
    currentModel = 'deepseek';
  } else if (modelUsed.includes('GLM')) {
    currentModel = 'glm';
  } else {
    currentModel = 'huggingface';
  }
  
  // Handle OpenAI-compatible response format
  if (data.choices && data.choices[0] && data.choices[0].message) {
    const assistantMessage = data.choices[0].message.content;
    return assistantMessage.trim() || "I'm here to help! Could you rephrase your question?";
  } else if (data.content) {
    // Alternative response format
    return data.content.trim() || "I'm here to help! Could you rephrase your question?";
  } else {
    console.log('🤗 Unexpected response format:', data);
    return "I'm processing your message! Could you try rephrasing it?";
  }
}

// Local fallback responses when Hugging Face API is unavailable
function getLocalFallbackResponse(message) {
  console.log('🤖 Using enhanced local fallback for:', message);
  
  const responses = [
    "# Hello! 👋 I'm Your Backup Assistant\n\nWhile the main AI models are loading, I'm here to help! 🤖\n\n## What I Can Do:\n• 💬 Basic conversations\n• 🔧 Simple programming help\n• 📚 Educational explanations\n\n*Ask me anything and I'll do my best!* ✨",
    "# Hi There! 😊 Backup Mode Active\n\nThe advanced AI is taking a break, but **I've got you covered!** �️\n\n## Ready to Help With:\n- **Programming concepts** 💻\n- **Web development basics** 🌐\n- **General questions** 💭\n\n*What would you like to explore?* 🌟"
  ];
  
  // Simple keyword-based responses with better formatting
  const lowerMessage = message.toLowerCase();
  
  // Greeting responses - simple and helpful
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') || lowerMessage === 'hi' || lowerMessage === 'hello') {
    return `Hello! 👋 Welcome to the app!\n\n**Quick shortcuts you can try:**\n• Say "games" to see available games\n• Say "apps" to explore tools\n• Say "help" for more options\n• Use the navigation menu above\n\nWhat would you like to do?`;
  }
  
  if (lowerMessage.includes('how are you') || lowerMessage.includes('how do you do')) {
    return `I'm doing great, thank you for asking! 😊\n\n**Here are some things you can explore:**\n• 🎮 Games: Snake, Memory, Tic Tac Toe\n• 🛠️ Tools: Calculator, Notepad, Timer\n• 💬 Chat with me about anything\n\nHow can I help you today?`;
  }
  
  if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
    return `**Here's what you can do in this app:**\n\n🎮 **Games:** Type "snake", "memory", or "tic tac toe"\n�️ **Tools:** Try "calculator", "notepad", or "timer"\n🏠 **Navigation:** Use the menu buttons above\n💬 **Chat:** Ask me questions or just have a conversation\n\n**Quick tip:** Click any app icon in the menu to get started!`;
  }
  
  if (lowerMessage.includes('bye') || lowerMessage.includes('goodbye') || lowerMessage.includes('see you')) {
    return `# Goodbye! 👋 It Was Great Chatting!\n\n**Thank you** for the wonderful conversation! 😊\n\n## Until Next Time:\n- 🌟 **Keep learning** and exploring\n- 💪 **Stay curious** about technology\n- 🚀 **Keep building** amazing things\n\n> *\"The best way to predict the future is to create it!\"* 💭\n\n**Hope to see you again soon!** ✨`;
  }
  
  if (lowerMessage.includes('thank') || lowerMessage.includes('thanks')) {
    return `# You're Very Welcome! 😊\n\n**Happy to help**, even in my simple backup mode! 🤖\n\n## Always Remember:\n- 🌟 No question is too small\n- 💪 Learning is a journey\n- � Every expert was once a beginner\n\n*Feel free to ask me anything else!* ✨`;
  }
  
  if (lowerMessage.includes('weather')) {
    return `# Weather Check! ⛅\n\nI wish I could be your **personal meteorologist**, but I'm just a simple backup bot! 🤖\n\n## Weather Alternatives:\n• 📱 **Your weather app**\n• 🌐 **Weather websites** (weather.com, etc.)\n• 📺 **Local news** weather reports\n\n*Stay dry and have a great day!* ☀️`;
  }
  
  if (lowerMessage.includes('time') || lowerMessage.includes('date')) {
    return `# Time & Date! ⏰\n\nI don't have access to **real-time data** in backup mode, but here's what you can do:\n\n## Quick Solutions:\n• 📱 **Device clock** - Check your phone/computer\n• 🌐 **Search \"current time\"** in your browser\n• ⌚ **Smart watch** or other devices\n\n> **Pro Tip:** Most devices show time in the status bar! 📲\n\n*Hope that helps!* ✨`;
  }
  
  // Educational topics with enhanced formatting
  if (lowerMessage.includes('html') || lowerMessage.includes('web development')) {
    return `# HTML & Web Development! 🏗️\n\n**Great choice!** HTML is the foundation of the web! 🌐\n\n## HTML Basics:\n• 📝 **Structure** - Uses tags like \`<h1>\`, \`<p>\`, \`<div>\`\n• 🏷️ **Tags** - Wrapped in angle brackets: \`<tag>content</tag>\`\n• 🔗 **Links** - \`<a href="url">Link text</a>\`\n• �️ **Images** - \`<img src="image.jpg" alt="description">\`\n\n## Basic HTML Structure:\n\`\`\`html\n<!DOCTYPE html>\n<html>\n<head>\n    <title>My Page</title>\n</head>\n<body>\n    <h1>Welcome!</h1>\n    <p>This is a paragraph.</p>\n</body>\n</html>\n\`\`\`\n\n> **Pro Tip:** Always use semantic HTML for better accessibility! ♿\n\n*The main AI can provide much more detailed guidance when available!* 🚀`;
  }
  
  if (lowerMessage.includes('css') || lowerMessage.includes('styling')) {
    return `# CSS Styling Magic! 🎨\n\n**Excellent choice!** CSS makes websites beautiful! ✨\n\n## CSS Fundamentals:\n• 🎯 **Selectors** - Target HTML elements\n• 🎨 **Properties** - Define styles (color, size, etc.)\n• 📦 **Box Model** - Margin, border, padding, content\n• 📱 **Responsive** - Media queries for mobile\n\n## Example Styling:\n\`\`\`css\n/* Beautiful button styling */\n.btn {\n    background: linear-gradient(45deg, #667eea, #764ba2);\n    color: white;\n    padding: 12px 24px;\n    border: none;\n    border-radius: 8px;\n    cursor: pointer;\n    transition: transform 0.2s ease;\n}\n\n.btn:hover {\n    transform: translateY(-2px);\n    box-shadow: 0 8px 25px rgba(0,0,0,0.15);\n}\n\`\`\`\n\n> **Remember:** CSS Grid and Flexbox are your best friends for layouts! 📐\n\n*For advanced CSS techniques, the main AI is incredibly helpful!* 💪`;
  }
  
  if (lowerMessage.includes('javascript') || lowerMessage.includes('js') || lowerMessage.includes('programming')) {
    return `# JavaScript Programming! 💻\n\n**Awesome!** JavaScript brings websites to life! ⚡\n\n## Core Concepts:\n• 🔢 **Variables** - Store data: \`let name = "John";\`\n• 🔧 **Functions** - Reusable code blocks\n• 🎯 **Events** - Respond to user actions\n• 🔄 **Loops** - Repeat actions efficiently\n• 📦 **Objects** - Organize related data\n\n## Interactive Example:\n\`\`\`javascript\n// Modern JavaScript function\nconst greetUser = (name) => {\n    const greeting = \`Hello, \${name}! Welcome! 👋\`;\n    console.log(greeting);\n    \n    // Add some magic ✨\n    document.body.style.background = 'linear-gradient(45deg, #667eea, #764ba2)';\n};\n\n// Call the function\ngreetUser('Developer');\n\n// Event handling\ndocument.querySelector('.btn').addEventListener('click', () => {\n    alert('Button clicked! 🎉');\n});\n\`\`\`\n\n## Modern JS Features:\n• ⚡ **Arrow Functions** - Concise syntax\n• 🎁 **Template Literals** - \`\${variable}\` interpolation\n• 🔄 **Async/Await** - Handle promises elegantly\n• 📦 **Modules** - Organize your code\n\n> **Pro Tip:** Practice with small projects and gradually build complexity! 🎯\n\n*For detailed programming help and advanced concepts, the main AI is fantastic!* �`;
  }
  
  if (lowerMessage.includes('learn') || lowerMessage.includes('teach') || lowerMessage.includes('tutorial')) {
    return `# Learning Journey! 📚 So Exciting!\n\n**I love your enthusiasm for learning!** 🌟\n\n## What I Can Teach (Backup Mode):\n• 🏗️ **HTML Basics** - Structure and semantics\n• 🎨 **CSS Fundamentals** - Styling and layouts\n• 💻 **JavaScript Intro** - Programming basics\n• 🤝 **General Concepts** - Web development overview\n\n## Learning Tips:\n• 🎯 **Start Small** - Build simple projects first\n• 🔄 **Practice Daily** - Consistency beats intensity\n• 🛠️ **Build Projects** - Apply what you learn\n• 🤝 **Join Communities** - Learn with others\n• 📖 **Read Documentation** - Your best friend!\n\n## Recommended Learning Path:\n1. **HTML** - Structure 🏗️\n2. **CSS** - Styling 🎨\n3. **JavaScript** - Interactivity ⚡\n4. **Frameworks** - React, Vue, etc. 🚀\n\n> **Remember:** Every expert was once a beginner! 💪\n\n*For detailed tutorials and advanced topics, the main AI provides incredible guidance!* ✨`;
  }
  
  if (lowerMessage.includes('code') || lowerMessage.includes('coding')) {
    return `# Coding is Amazing! 💻✨\n\n**Welcome to the wonderful world of programming!** 🌟\n\n## Why Coding is Fantastic:\n• 🎨 **Creative Expression** - Turn ideas into reality\n• 🧩 **Problem Solving** - Break down complex challenges\n• 🚀 **Build Anything** - Websites, apps, games, AI!\n• � **Career Opportunities** - High demand, great pay\n• 🌍 **Global Impact** - Change the world with code\n\n## What I Can Help With (Backup Mode):\n• 🏗️ **HTML** - Web structure\n• 🎨 **CSS** - Beautiful styling\n• ⚡ **JavaScript** - Interactive functionality\n• 💡 **Basic Concepts** - Variables, functions, loops\n\n## Coding Principles:\n• 📝 **Clean Code** - Write readable, maintainable code\n• 🧪 **Test Often** - Debug early and frequently\n• 📚 **Keep Learning** - Technology evolves rapidly\n• 🤝 **Collaborate** - Work well with others\n• 🔄 **Iterate** - Improve continuously\n\n## Simple Example:\n\`\`\`javascript\n// Your first interactive webpage! 🎉\nfunction createMagic() {\n    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'];\n    const randomColor = colors[Math.floor(Math.random() * colors.length)];\n    \n    document.body.style.background = randomColor;\n    console.log('✨ Magic created! Color:', randomColor);\n}\n\n// Call the function\ncreateMagic();\n\`\`\`\n\n> **Pro Tip:** Start with small projects and gradually increase complexity! 🎯\n\n*For complex coding help, debugging, and advanced topics, the main AI is incredible!* 🚀`;
  }
  
  // Default responses - simple and friendly
  const defaultResponses = [
    `Hi there! 😊 I'm here to help you navigate this app.\n\n**Try saying:** "games", "tools", or "help" to get started!`,
    `Hello! � This app has lots of cool features.\n\n**Quick tip:** Use the menu above or just tell me what you'd like to do!`,
    `Hey! 🌟 Ready to explore?\n\n**Popular choices:** Snake game, Calculator, or Notepad. What sounds fun?`
  ];
  
  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

// Test Hugging Face Router API availability
async function testHuggingFaceAPI(apiKey) {
  console.log('🧪 Testing Hugging Face Router API availability...');
  
  try {
    // Test with GLM-4.5 using Router API
    const response = await window.originalFetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'zai-org/GLM-4.5',
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        max_tokens: 20
      })
    });
    
    console.log('🧪 Router API Test Response Status:', response.status);
    
    if (response.ok) {
      console.log('✅ Hugging Face Router API is accessible');
      return true;
    } else {
      const errorText = await response.text();
      console.log('❌ Router API Test Failed:', errorText);
      return false;
    }
  } catch (error) {
    console.log('❌ Router API Test Error:', error);
    return false;
  }
}

// Streaming message functions
function createStreamingMessage() {
  const chatMessages = document.getElementById('chatMessages');
  
  // Create message element
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message ai-message streaming';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar ai-avatar';
  avatar.innerHTML = getAIAvatar();
  
  const content = document.createElement('div');
  content.className = 'message-content';
  content.innerHTML = '<div class="streaming-dots"><span></span><span></span><span></span></div>';
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(content);
  chatMessages.appendChild(messageDiv);
  
  // Smooth scroll to bottom
  if (chatMessages) {
    smoothScrollToBottom(chatMessages, 300);
  }
  
  return messageDiv;
}

function updateStreamingMessage(messageElement, text) {
  if (!messageElement) return;
  
  const content = messageElement.querySelector('.message-content');
  if (!content) return;
  
  // Format the content as it streams
  const formattedContent = formatMessageContent(text);
  content.innerHTML = formattedContent;
  
  // Smooth scroll to bottom
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    smoothScrollToBottom(chatMessages, 150);
  }
}

function finalizeStreamingMessage(messageElement, finalText) {
  if (!messageElement) return;
  
  // Remove streaming class
  messageElement.classList.remove('streaming');
  
  // Final formatting with all features
  const content = messageElement.querySelector('.message-content');
  if (content) {
    const formattedContent = formatMessageContent(finalText);
    content.innerHTML = formattedContent;
    
    // Re-apply syntax highlighting and math rendering with safe error handling
    if (window.safePrismHighlight) {
      window.safePrismHighlight(messageElement);
    } else if (window.Prism && window.Prism.highlightAllUnder) {
      try {
        window.Prism.highlightAllUnder(messageElement);
      } catch (e) {
        console.warn('🎨 Prism highlighting failed:', e.message);
      }
    }
    if (window.MathJax) {
      MathJax.typesetPromise([messageElement]).catch(console.error);
    }
  }
  
  // Smooth scroll to bottom
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    smoothScrollToBottom(chatMessages, 300);
  }
}

// Simulate streaming response for better UX
async function simulateStreamingResponse(messageElement, fullText) {
  if (!messageElement || !fullText) return;
  
  const content = messageElement.querySelector('.message-content');
  if (!content) return;
  
  const chatMessages = document.getElementById('chatMessages');
  
  // Split text into words for progressive display
  const words = fullText.split(' ');
  let currentText = '';
  
  for (let i = 0; i < words.length; i++) {
    currentText += (i > 0 ? ' ' : '') + words[i];
    
    // Update content progressively
    updateStreamingMessage(messageElement, currentText);
    
    // Smooth auto-scroll as content grows
    smoothScrollToBottom(chatMessages, 150);
    
    // Add small delay for streaming effect
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  
  // Finalize with complete formatting and final scroll
  finalizeStreamingMessage(messageElement, fullText);
  smoothScrollToBottom(chatMessages, 300);
}

function addMessageToChat(content, role, isError = false) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}-message`;
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? '👤' : getAIAvatar();
  
  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  
  if (isError) {
    messageContent.style.color = '#ff6b6b';
    messageContent.style.borderColor = 'rgba(255, 107, 107, 0.3)';
  }
  
  // Process markdown-like formatting
  const formattedContent = formatMessageContent(content);
  messageContent.innerHTML = formattedContent;
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(messageContent);
  
  chatMessages.appendChild(messageDiv);
  
  // Smooth auto-scroll to new message
  smoothScrollToBottom(chatMessages, 300);
  
  // Force MathJax re-rendering for any math content
  setTimeout(() => {
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
      console.log('🔢 Forcing MathJax re-render for new message...');
      MathJax.typesetPromise([messageContent]).then(() => {
        console.log('✅ MathJax re-render completed for message');
      }).catch(err => {
        console.warn('⚠️ MathJax re-render failed:', err);
        // Fallback: try global typeset
        MathJax.typesetPromise().catch(e => console.warn('Global MathJax fallback failed:', e));
      });
    }
  }, 100);
  
  // Add to chat history (but not error messages)
  if (!isError) {
    chatHistory.push({ role, content });
    saveChatHistory();
  }
}

// Function to process and format DeepSeek thinking sections
function processThinkingSections(content) {
  console.log('🧠 Processing thinking sections in content...');
  
  // Common patterns for DeepSeek thinking sections
  const thinkingPatterns = [
    // <think>...</think> tags
    /<think>([\s\S]*?)<\/think>/gi,
    // <thinking>...</thinking> tags
    /<thinking>([\s\S]*?)<\/thinking>/gi,
    // **Thinking:** or **思考:** sections
    /\*\*(?:Thinking|思考):\*\*([\s\S]*?)(?=\*\*[A-Za-z\u4e00-\u9fff]+:|$)/gi,
    // [Thinking] or [思考] sections
    /\[(?:Thinking|思考)\]([\s\S]*?)(?=\[[A-Za-z\u4e00-\u9fff]+\]|$)/gi,
    // Lines starting with "思考:" or "Thinking:"
    /^(?:思考:|Thinking:)([\s\S]*?)(?=^[A-Za-z]|\n\n|$)/gmi
  ];
  
  let processedContent = content;
  let thinkingCounter = 1;
  
  thinkingPatterns.forEach(pattern => {
    processedContent = processedContent.replace(pattern, (match, thinkingContent) => {
      if (!thinkingContent || thinkingContent.trim().length < 10) {
        return match; // Skip very short thinking sections
      }
      
      console.log('🧠 Found thinking section:', thinkingContent.substring(0, 100) + '...');
      
      const cleanThinking = thinkingContent.trim();
      const thinkingId = `thinking-${Date.now()}-${thinkingCounter++}`;
      
      return `<div class="thinking-section collapsed" id="${thinkingId}">
        <div class="thinking-header">
          <span class="thinking-icon">🧠</span>
          <span class="thinking-title">DeepSeek Reasoning Process</span>
          <button class="thinking-toggle" onclick="toggleThinking('${thinkingId}')">Show</button>
        </div>
        <div class="thinking-content">
          ${cleanThinking.replace(/\n/g, '<br>')}
        </div>
      </div>\n\n`;
    });
  });
  
  // Also look for reasoning patterns without explicit tags
  const reasoningPatterns = [
    // "Let me think about this..." patterns
    /^(?:Let me think about this|I need to consider|First, let me analyze)([\s\S]*?)(?=^[A-Z]|$)/gmi,
    // Step-by-step reasoning
    /^(?:Step \d+:|First,|Second,|Next,|Then,|Finally,)([\s\S]*?)(?=^(?:Step \d+:|First,|Second,|Next,|Then,|Finally,|[A-Z])|$)/gmi
  ];
  
  // Only apply reasoning patterns if no explicit thinking sections were found
  if (thinkingCounter === 1) {
    reasoningPatterns.forEach(pattern => {
      processedContent = processedContent.replace(pattern, (match, reasoningContent) => {
        if (!reasoningContent || reasoningContent.trim().length < 20) {
          return match;
        }
        
        console.log('🧠 Found reasoning section:', reasoningContent.substring(0, 100) + '...');
        
        const cleanReasoning = reasoningContent.trim();
        const thinkingId = `thinking-${Date.now()}-${thinkingCounter++}`;
        
        return `<div class="thinking-section collapsed" id="${thinkingId}">
          <div class="thinking-header">
            <span class="thinking-icon">🔍</span>
            <span class="thinking-title">AI Reasoning Steps</span>
            <button class="thinking-toggle" onclick="toggleThinking('${thinkingId}')">Show</button>
          </div>
          <div class="thinking-content">
            ${match.replace(/\n/g, '<br>')}
          </div>
        </div>\n\n`;
      });
    });
  }
  
  return processedContent;
}

// Function to toggle thinking section visibility
window.toggleThinking = function(thinkingId) {
  const thinkingSection = document.getElementById(thinkingId);
  const toggle = thinkingSection.querySelector('.thinking-toggle');
  
  if (thinkingSection.classList.contains('collapsed')) {
    thinkingSection.classList.remove('collapsed');
    toggle.textContent = 'Hide';
  } else {
    thinkingSection.classList.add('collapsed');
    toggle.textContent = 'Show';
  }
};

function formatMessageContent(content) {
  try {
    // First, extract and format thinking sections from DeepSeek responses
    content = processThinkingSections(content);
    
    // Configure marked for better parsing
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        highlight: function(code, lang) {
          // Use Prism for syntax highlighting if available
          if (typeof Prism !== 'undefined' && lang && Prism.languages[lang]) {
            try {
              return Prism.highlight(code, Prism.languages[lang], lang);
            } catch (e) {
              console.warn('Prism highlighting failed:', e);
              return code;
            }
          }
          return code;
        },
        breaks: true,
        gfm: true,
        sanitize: false,
        smartLists: true,
        smartypants: true
      });
      
      // Parse markdown to HTML
      let html = marked.parse(content);
      
      // Add language labels to code blocks and wrap them properly
      html = html.replace(/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g, 
        '<div class="code-block-wrapper"><pre data-lang="$1"><code class="language-$1">$2</code><button class="copy-code-btn" onclick="copyCodeToClipboard(this)">Copy</button></pre></div>');
      
      // Handle code blocks without language specification
      html = html.replace(/<pre><code(?!.*class="language-)([\s\S]*?)<\/code><\/pre>/g, 
        '<div class="code-block-wrapper"><pre><code>$1</code><button class="copy-code-btn" onclick="copyCodeToClipboard(this)">Copy</button></pre></div>');
      
      // Process math expressions with MathJax - Enhanced for better LaTeX support
      if (typeof MathJax !== 'undefined') {
        console.log('🔢 Processing LaTeX math expressions...');
        
        // Handle display math ($$...$$) - multiple patterns
        html = html.replace(/\$\$([\s\S]*?)\$\$/g, '<div class="math-display">\\[$1\\]</div>');
        html = html.replace(/\\\[([\s\S]*?)\\\]/g, '<div class="math-display">\\[$1\\]</div>');
        
        // Handle inline math ($...$) - be careful not to match display math
        html = html.replace(/\$([^$\n\r]+?)\$/g, '<span class="math-inline">\\($1\\)</span>');
        html = html.replace(/\\\(([^\\]+?)\\\)/g, '<span class="math-inline">\\($1\\)</span>');
        
        // Handle common LaTeX expressions that might not be wrapped
        html = html.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="math-inline">\\(\\frac{$1}{$2}\\)</span>');
        html = html.replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, '<span class="math-inline">\\(\\sum_{$1}^{$2}\\)</span>');
        html = html.replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, '<span class="math-inline">\\(\\int_{$1}^{$2}\\)</span>');
        
        console.log('🔢 Math expressions processed, triggering MathJax...');
        
        // Enhanced MathJax rendering with multiple attempts
        const triggerMathJax = () => {
          if (MathJax && MathJax.typesetPromise) {
            console.log('🔢 MathJax typesetPromise available, rendering...');
            MathJax.typesetPromise().then(() => {
              console.log('✅ MathJax rendering completed successfully');
            }).catch(err => {
              console.warn('⚠️ MathJax rendering error:', err);
              // Fallback: try again with startup promise
              if (MathJax.startup) {
                MathJax.startup.promise.then(() => {
                  return MathJax.typesetPromise();
                }).catch(e => console.warn('MathJax fallback failed:', e));
              }
            });
          } else if (MathJax && MathJax.Hub) {
            // Fallback for older MathJax versions
            console.log('🔢 Using MathJax Hub for rendering...');
            MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
          } else {
            console.warn('⚠️ MathJax not available for rendering');
          }
        };
        
        // Trigger MathJax rendering with multiple timeouts for reliability
        setTimeout(triggerMathJax, 50);
        setTimeout(triggerMathJax, 200);
        setTimeout(triggerMathJax, 500);
      } else {
        console.warn('⚠️ MathJax library not loaded');
      }
      
      // Apply syntax highlighting to any remaining code elements
      setTimeout(() => {
        if (typeof Prism !== 'undefined') {
          try {
            Prism.highlightAll();
          } catch (e) {
            console.warn('Prism highlighting error:', e);
          }
        }
      }, 50);
      
      return html;
      
    } else {
      // Fallback to simple formatting if marked is not available
      console.warn('Marked library not available, using fallback formatting');
      return simpleMarkdownFallback(content);
    }
    
  } catch (error) {
    console.error('Error formatting message content:', error);
    return simpleMarkdownFallback(content);
  }
}

// Fallback function for simple markdown formatting
function simpleMarkdownFallback(content) {
  let formatted = content
    // Code blocks with language detection
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
      const langLabel = lang ? ` data-lang="${lang}"` : '';
      return `<div class="code-block-wrapper"><pre${langLabel}><code>${code.trim()}</code><button class="copy-code-btn" onclick="copyCodeToClipboard(this)">Copy</button></pre></div>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic text
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Lists
    .replace(/^\* (.*$)/gm, '<li>$1</li>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Line breaks
    .replace(/\n/g, '<br>');
  
  // Wrap lists
  formatted = formatted.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
  
  // Handle math expressions even in fallback - Enhanced
  if (typeof MathJax !== 'undefined') {
    console.log('🔢 Fallback: Processing LaTeX math expressions...');
    
    // Handle display math patterns
    formatted = formatted.replace(/\$\$([\s\S]*?)\$\$/g, '<div class="math-display">\\[$1\\]</div>');
    formatted = formatted.replace(/\\\[([\s\S]*?)\\\]/g, '<div class="math-display">\\[$1\\]</div>');
    
    // Handle inline math patterns
    formatted = formatted.replace(/\$([^$\n\r]+?)\$/g, '<span class="math-inline">\\($1\\)</span>');
    formatted = formatted.replace(/\\\(([^\\]+?)\\\)/g, '<span class="math-inline">\\($1\\)</span>');
    
    // Handle common LaTeX expressions
    formatted = formatted.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="math-inline">\\(\\frac{$1}{$2}\\)</span>');
    formatted = formatted.replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, '<span class="math-inline">\\(\\sum_{$1}^{$2}\\)</span>');
    
    console.log('🔢 Fallback: Math expressions processed, triggering MathJax...');
    
    // Enhanced MathJax rendering
    const triggerMathJax = () => {
      if (MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise().then(() => {
          console.log('✅ Fallback: MathJax rendering completed');
        }).catch(err => {
          console.warn('⚠️ Fallback: MathJax rendering error:', err);
        });
      }
    };
    
    setTimeout(triggerMathJax, 50);
    setTimeout(triggerMathJax, 200);
  }
  
  return formatted;
}

// Function to copy code to clipboard
window.copyCodeToClipboard = function(button) {
  const codeBlock = button.parentElement.querySelector('code');
  const code = codeBlock.textContent || codeBlock.innerText;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => {
      const originalText = button.textContent;
      button.textContent = 'Copied!';
      button.classList.add('copied');
      
      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy code:', err);
      fallbackCopyCode(code, button);
    });
  } else {
    fallbackCopyCode(code, button);
  }
};

// Fallback copy function for browsers without clipboard API
function fallbackCopyCode(code, button) {
  const textArea = document.createElement('textarea');
  textArea.value = code;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    document.execCommand('copy');
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');
    
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Fallback copy failed:', err);
    button.textContent = 'Copy failed';
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 2000);
  } finally {
    document.body.removeChild(textArea);
  }
}

function showTypingIndicator() {
  const chatMessages = document.getElementById('chatMessages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-message bot-message';
  typingDiv.id = 'typing-indicator';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = getAIAvatar();
  
  const typingContent = document.createElement('div');
  typingContent.className = 'typing-indicator';
  typingContent.innerHTML = `
    <div class="typing-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  
  typingDiv.appendChild(avatar);
  typingDiv.appendChild(typingContent);
  
  chatMessages.appendChild(typingDiv);
  
  // Smooth scroll to typing indicator
  smoothScrollToBottom(chatMessages, 200);
  
  return typingDiv;
}

function removeTypingIndicator(indicator) {
  if (indicator && indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
  }
}

function clearChatHistory() {
  const chatMessages = document.getElementById('chatMessages');
  
  // Clear all messages
  chatMessages.innerHTML = '';
  
  chatHistory = [];
  saveChatHistory();
}

function saveChatHistory() {
  localStorage.setItem('chatbot_history', JSON.stringify(chatHistory));
}

function loadChatHistory() {
  const saved = localStorage.getItem('chatbot_history');
  if (saved) {
    try {
      chatHistory = JSON.parse(saved);
      
      // Restore chat messages
      chatHistory.forEach(msg => {
        addMessageToChat(msg.content, msg.role);
      });
    } catch (e) {
      console.warn('Failed to load chat history:', e);
      chatHistory = [];
    }
  }
}

// Make chatbot functions globally available
window.initializeChatbot = initializeChatbot;
window.sendMessage = sendMessage;
window.clearChatHistory = clearChatHistory;

// Electron-specific functionality
function initializeElectronFeatures() {
  console.log('⚡ Initializing Electron features...');
  
  // Add Electron-specific styling
  document.body.classList.add('electron-app');
  
  // Add update check button to user menu if logged in
  addElectronUpdateButton();
  
  // Check for updates on app startup (after 5 seconds)
  setTimeout(async () => {
    try {
      await window.electronAPI.checkForUpdates();
      console.log('🔍 Initial update check completed');
    } catch (error) {
      console.log('❌ Update check failed:', error);
    }
  }, 5000);
  
  // Log app version
  window.electronAPI.getAppInfo().then(info => {
    console.log('📱 Electron App Info:', info);
  });
}

function addElectronUpdateButton() {
  // Only add if user menu exists (user is logged in)
  const userMenu = document.getElementById('userMenu');
  if (!userMenu) return;
  
  // Check if button already exists
  if (document.getElementById('electronUpdateBtn')) return;
  
  // Create update button
  const updateBtn = document.createElement('button');
  updateBtn.id = 'electronUpdateBtn';
  updateBtn.className = 'btn btn-outline';
  updateBtn.innerHTML = '🔄 Check for Updates';
  updateBtn.style.cssText = `
    margin-left: 10px;
    padding: 6px 12px;
    font-size: 0.875rem;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.1);
    backdrop-filter: blur(10px);
    border-radius: 6px;
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
  `;
  
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.innerHTML = '🔄 Checking...';
    
    try {
      await window.electronAPI.checkForUpdates();
      showNotification('✅ Update check completed!', 'success');
    } catch (error) {
      console.error('Update check failed:', error);
      showNotification('❌ Failed to check for updates', 'error');
    } finally {
      updateBtn.disabled = false;
      updateBtn.innerHTML = '🔄 Check for Updates';
    }
  });
  
  updateBtn.addEventListener('mouseenter', () => {
    updateBtn.style.background = 'rgba(255,255,255,0.2)';
    updateBtn.style.transform = 'translateY(-1px)';
  });
  
  updateBtn.addEventListener('mouseleave', () => {
    updateBtn.style.background = 'rgba(255,255,255,0.1)';
    updateBtn.style.transform = 'translateY(0)';
  });
  
  // Add to user menu
  userMenu.appendChild(updateBtn);
  
  // Show notification about desktop features
  setTimeout(() => {
    showNotification('🖥️ Desktop features enabled! Check for updates anytime.', 'info');
  }, 3000);
}
