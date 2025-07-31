// Quick Firebase Debug Script
// Add this to your browser console on supremesahil.vercel.app

console.log('🔧 FIREBASE DEBUG REPORT');
console.log('========================');
console.log('Domain:', window.location.hostname);
console.log('Full URL:', window.location.href);
console.log('Firebase available:', typeof firebase !== 'undefined');
console.log('Firebase app:', typeof firebase !== 'undefined' ? firebase.apps.length : 'N/A');
console.log('Auth object:', typeof window.firebaseAuth !== 'undefined');
console.log('Google Provider:', typeof window.googleProvider !== 'undefined');

// Test button clicks
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');

console.log('Login button found:', !!loginBtn);
console.log('Signup button found:', !!signupBtn);

if (loginBtn) {
    console.log('Login button visible:', loginBtn.offsetParent !== null);
    console.log('Login button disabled:', loginBtn.disabled);
}

if (signupBtn) {
    console.log('Signup button visible:', signupBtn.offsetParent !== null);
    console.log('Signup button disabled:', signupBtn.disabled);
}

// Test modal elements
const loginModal = document.getElementById('loginModal');
const signupModal = document.getElementById('signupModal');

console.log('Login modal found:', !!loginModal);
console.log('Signup modal found:', !!signupModal);

console.log('========================');
console.log('🔧 END DEBUG REPORT');
