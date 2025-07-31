// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD6dEYItWa6W6xhcQGQAg2YlSKW_pgplYA",
  authDomain: "sahil-s-web.firebaseapp.com",
  projectId: "sahil-s-web",
  storageBucket: "sahil-s-web.firebasestorage.app",
  messagingSenderId: "694102244011",
  appId: "1:694102244011:web:31feaf0b244fba9bbd95ee"
};

// Production debugging and error handling
const isProduction = window.location.hostname !== 'localhost';
const currentDomain = window.location.hostname;

console.log(`🔥 Initializing Firebase for ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}: ${currentDomain}`);

// Initialize Firebase with error handling
let app, auth, googleProvider;

try {
  // Initialize Firebase
  app = firebase.initializeApp(firebaseConfig);
  console.log('✅ Firebase app initialized successfully');
  
  // Initialize Firebase Auth
  auth = firebase.auth();
  console.log('✅ Firebase Auth initialized successfully');
  
  // Google Auth Provider with enhanced configuration
  googleProvider = new firebase.auth.GoogleAuthProvider();
  googleProvider.addScope('email');
  googleProvider.addScope('profile');
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });
  console.log('✅ Google Auth Provider configured successfully');
  
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  
  if (isProduction) {
    console.error('🚨 PRODUCTION ERROR: Firebase failed to initialize');
    console.error('Domain:', currentDomain);
    console.error('Error details:', error.message);
  }
}

// Enhanced authentication state monitoring
if (auth) {
  if (isProduction) {
    console.log('🌐 Production mode - setting up auth monitoring for:', currentDomain);
    
    // Enhanced error handling for production
    auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('✅ User authenticated in production:', user.email);
        console.log('🔧 User UID:', user.uid);
        console.log('🔧 User provider:', user.providerData);
      } else {
        console.log('ℹ️ User not authenticated in production');
      }
    }, (error) => {
      console.error('❌ Auth state error in production:', error);
      console.error('🚨 Domain causing issue:', currentDomain);
      console.error('🚨 Error code:', error.code);
      console.error('🚨 Error message:', error.message);
    });
  } else {
    console.log('🏠 Development mode detected');
    
    auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('✅ Dev: User authenticated:', user.email);
      } else {
        console.log('ℹ️ Dev: User not authenticated');
      }
    });
  }
} else {
  console.error('❌ Firebase Auth not available!');
}

// Export for use in main.js with validation
if (auth && googleProvider) {
  window.firebaseAuth = auth;
  window.googleProvider = googleProvider;
  console.log('🔥 Firebase objects exported successfully for:', currentDomain);
  
  if (isProduction) {
    console.log('🌐 PRODUCTION READY: Firebase authentication configured');
    console.log('🔧 Auth domain:', firebaseConfig.authDomain);
    console.log('🔧 Current domain:', currentDomain);
    
    // Check if domain is authorized
    if (currentDomain !== 'localhost' && !currentDomain.includes('firebaseapp.com')) {
      console.log('⚠️ DOMAIN CHECK: Make sure', currentDomain, 'is added to Firebase authorized domains');
      console.log('📋 Go to: https://console.firebase.google.com/project/sahil-s-web/authentication/settings');
    }
  }
} else {
  console.error('❌ Failed to export Firebase objects');
  console.error('Auth available:', !!auth);
  console.error('Google Provider available:', !!googleProvider);
}
