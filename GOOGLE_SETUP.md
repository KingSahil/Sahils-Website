# Google Login Setup Guide

## How to Set Up Google Authentication

To use Google login in this application, you need to:

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" or select an existing project
3. Name your project (e.g., "Sahil's Website")

### 2. Enable Google Identity Services

1. In your project, go to "APIs & Services" > "Library"
2. Search for "Google Identity Services API"
3. Click on it and press "Enable"

### 3. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Web application"
4. Add authorized domains:
   - `http://localhost:3003` (for development)
   - Your production domain (if you have one)
5. Copy the generated Client ID

### 4. Update the Client ID in main.js

1. Open `main.js`
2. Find the line: `const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';`
3. Replace `'YOUR_GOOGLE_CLIENT_ID'` with your actual Client ID from step 3

### Example:
```javascript
const GOOGLE_CLIENT_ID = '123456789-abc123def456ghi789jkl012mno345pqr.apps.googleusercontent.com';
```

### 5. Test the Application

1. Save the file
2. Refresh your browser
3. You should see a "Sign in with Google" button
4. Click it to test the login functionality

## Security Notes

- Never commit your actual Client ID to public repositories
- For production, use environment variables or a secure configuration system
- The current setup is for development/demo purposes only

## Troubleshooting

- **Button doesn't appear**: Check that the Google Client ID is correctly set
- **Login fails**: Verify your domain is added to authorized origins
- **Console errors**: Check the browser console for specific error messages
