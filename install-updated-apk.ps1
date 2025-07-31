# Quick install script for the updated APK (Windows)

Write-Host "🔄 Installing updated APK with latest changes..." -ForegroundColor Cyan

# Check if ADB is available
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbPath) {
    Write-Host "❌ ADB not found. Please install Android SDK platform tools." -ForegroundColor Red
    Write-Host "   You can also manually copy the APK to your device and install it." -ForegroundColor Yellow
    Write-Host "   APK location: android/app/build/outputs/apk/debug/app-debug.apk" -ForegroundColor Yellow
    exit 1
}

# Install the APK
Write-Host "📱 Installing APK..." -ForegroundColor Blue
$result = & adb install -r "android/app/build/outputs/apk/debug/app-debug.apk"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ APK installed successfully!" -ForegroundColor Green
    Write-Host "🎮 Latest features included:" -ForegroundColor Green
    Write-Host "   • Snake game with swipe/touch controls" -ForegroundColor White
    Write-Host "   • Mobile menu with 3 vertical bars" -ForegroundColor White
    Write-Host "   • iPhone dark/light mode fixes" -ForegroundColor White
    Write-Host "   • All performance improvements" -ForegroundColor White
} else {
    Write-Host "❌ Installation failed. Try installing manually:" -ForegroundColor Red
    Write-Host "   1. Copy android/app/build/outputs/apk/debug/app-debug.apk to your device" -ForegroundColor Yellow
    Write-Host "   2. Enable 'Install from unknown sources' in Android settings" -ForegroundColor Yellow
    Write-Host "   3. Tap the APK file to install" -ForegroundColor Yellow
}
