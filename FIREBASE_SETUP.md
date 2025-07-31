# Firebase Authentication Setup Guide

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter your project name (e.g., "sahils-website")
4. Accept the terms and click "Continue"
5. Choose whether to enable Google Analytics (optional)
6. Click "Create project"

## Step 2: Enable Authentication

1. In the Firebase Console, select your project
2. Click on "Authentication" in the left sidebar
3. Click on the "Get started" button
4. Go to the "Sign-in method" tab
5. Enable the following sign-in providers:
   - **Email/Password**: Click on it and toggle "Enable"
   - **Google**: Click on it, toggle "Enable", and add your project's support email

## Step 3: Configure Your Domain

1. In the "Sign-in method" tab, scroll down to "Authorized domains"
2. Add your domains:
   - `localhost` (for development)
   - Your production domain (e.g., `yourwebsite.com`)
   - If using Vercel: `your-app.vercel.app`

## Step 4: Get Your Firebase Configuration

1. Click on the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps" section
4. Click on "Web" icon (`</>`) to add a web app
5. Enter your app nickname (e.g., "Sahil's Website")
6. Click "Register app"
7. Copy the configuration object that looks like this:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key-here",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

## Step 5: Update Your Configuration

1. Open `firebase-config.js` in your project
2. Replace the placeholder values with your actual Firebase configuration:

```javascript
// Replace this section in firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyC...", // Your actual API key
  authDomain: "sahils-website-12345.firebaseapp.com", // Your actual auth domain
  projectId: "sahils-website-12345", // Your actual project ID
  storageBucket: "sahils-website-12345.appspot.com", // Your actual storage bucket
  messagingSenderId: "123456789", // Your actual sender ID
  appId: "1:123456789:web:abcdef123456" // Your actual app ID
};
```

## Step 6: Set Up Google OAuth (Optional but Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project (or create credentials for it)
3. Go to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth 2.0 Client IDs"
5. Choose "Web application"
6. Add your authorized domains:
   - `http://localhost:5173` (for Vite dev server)
   - `https://your-domain.com` (your production domain)
7. Copy the Client ID and update your Firebase Google provider settings

## Step 7: Test Your Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open your website in the browser
3. Click on "Sign Up" or "Login"
4. Test both email/password and Google authentication

## Features Included

✅ **Email/Password Authentication**
- User registration with name, email, and password
- User login with email and password
- Password validation (minimum 6 characters)
- Email format validation

✅ **Google OAuth Authentication**
- One-click sign-in with Google account
- Automatic profile picture and name import

✅ **User Session Management**
- Persistent login across browser sessions
- Automatic logout functionality
- User profile display in navigation

✅ **Password Reset**
- "Forgot Password" functionality
- Email-based password reset

✅ **Form Validation**
- Real-time form validation
- Clear error messages
- Loading states during authentication

✅ **Responsive Design**
- Mobile-friendly authentication modals
- Touch-optimized buttons
- Adaptive layouts

## Security Features

🔒 **Secure by Default**
- Firebase handles all security aspects
- Encrypted data transmission
- CORS protection
- Rate limiting for failed attempts

🔒 **Best Practices**
- Proper form validation
- Secure password requirements
- Error handling without exposing sensitive info
- Automatic session management

## Customization Options

You can customize the authentication system by:

1. **Styling**: Modify the CSS classes in `style.css`
2. **Validation**: Update the validation functions in `main.js`
3. **User Profile**: Add more user fields in the signup form
4. **Email Templates**: Customize in Firebase Console > Authentication > Templates

## Troubleshooting

**Common Issues:**

1. **"Firebase not defined" error**
   - Make sure the Firebase scripts are loaded before your main.js
   - Check the console for any script loading errors

2. **Google sign-in popup blocked**
   - Make sure popup blockers are disabled
   - Check that your domain is authorized in Firebase

3. **Authentication not working on production**
   - Add your production domain to Firebase authorized domains
   - Update your OAuth client with production URLs

4. **CORS errors**
   - Make sure your domain is properly configured in Firebase
   - Check that your Firebase project is active

Need help? Check the Firebase documentation or feel free to ask for assistance!
