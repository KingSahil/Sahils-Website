#!/bin/bash
# Quick install script for the updated APK

echo "🔄 Installing updated APK with latest changes..."

# Check if ADB is available
if ! command -v adb &> /dev/null; then
    echo "❌ ADB not found. Please install Android SDK platform tools."
    echo "   You can also manually copy the APK to your device and install it."
    echo "   APK location: android/app/build/outputs/apk/debug/app-debug.apk"
    exit 1
fi

# Install the APK
echo "📱 Installing APK..."
adb install -r "android/app/build/outputs/apk/debug/app-debug.apk"

if [ $? -eq 0 ]; then
    echo "✅ APK installed successfully!"
    echo "🎮 Latest features included:"
    echo "   • Snake game with swipe/touch controls"
    echo "   • Mobile menu with 3 vertical bars"
    echo "   • iPhone dark/light mode fixes"
    echo "   • All performance improvements"
else
    echo "❌ Installation failed. Try installing manually:"
    echo "   1. Copy android/app/build/outputs/apk/debug/app-debug.apk to your device"
    echo "   2. Enable 'Install from unknown sources' in Android settings"
    echo "   3. Tap the APK file to install"
fi
