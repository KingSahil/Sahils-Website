import './style.css'

// App version for cache busting
const APP_VERSION = '2.1.0';
const VERSION_CHECK_INTERVAL = 300000; // Check every 5 minutes (optimized frequency)
let lastUpdateCheck = 0;
let updateNotificationShown = false;

// Performance-optimized caching function
function preventBrowserCaching() {
  // Use requestIdleCallback for non-critical operations
  const cleanupTasks = () => {
    // Clear any existing service worker registrations
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          registration.unregister();
          console.log('🧹 Cleared service worker:', registration.scope);
        }
      });
    }

    // Clear all types of browser storage
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear IndexedDB if available
      if ('indexedDB' in window) {
        indexedDB.databases().then(databases => {
          databases.forEach(db => {
            indexedDB.deleteDatabase(db.name);
          });
        }).catch(() => {});
      }
      
      console.log('🧹 Cleared browser storage');
    } catch (e) {
      console.log('⚠️ Could not clear some storage:', e);
    }
  };

  // Use requestIdleCallback if available, otherwise setTimeout
  if ('requestIdleCallback' in window) {
    requestIdleCallback(cleanupTasks);
  } else {
    setTimeout(cleanupTasks, 100);
  }

  // Add cache-busting parameters to all requests (optimized)
  const timestamp = Date.now();
  
  // Override fetch to add cache-busting (only if not already overridden)
  if (!window._fetchOverridden) {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      let url = args[0];
      if (typeof url === 'string') {
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}_cb=${timestamp}&_t=${Date.now()}`;
        args[0] = url;
      }
      return originalFetch.apply(this, args);
    };
    window._fetchOverridden = true;
  }

  // Force reload stylesheets with cache busting
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  links.forEach(link => {
    const href = link.href.split('?')[0];
    link.href = `${href}?v=${timestamp}&t=${Date.now()}`;
  });

  // Monitor and prevent future caching
  setInterval(() => {
    // Clear any caches that might have been created
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.delete(cacheName);
        });
      });
    }
    
    // Clear service workers that might register
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.unregister();
        });
      });
    }
  }, 30000); // Check every 30 seconds

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

// App initialization
document.addEventListener('DOMContentLoaded', function() {
  // Activate anti-caching measures first
  preventBrowserCaching();
  
  // setupCacheBusting(); // DISABLED for instant updates
  initializeApp();
  setupRouting();
  // registerServiceWorker(); // DISABLED for instant updates
});

// Make functions globally available for onclick handlers
window.updateApp = updateApp;
window.dismissUpdate = dismissUpdate;

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
  // Performance optimization: batch DOM operations
  const tasks = [
    () => setupiOSFixes(),
    () => setupAdminPanel(),
    () => setupModalHandlers(),
    () => setupMobileMenu(),
    () => setupFormHandlers(),
    () => setupFormValidation(),
    () => setupScrollEffects(),
    () => setupThemeToggle(),
    () => setupDynamicBackground(),
    () => setupButtonShimmer(),
    () => setupGamesNavigation(),
    () => setupTicTacToe(),
    () => setupMemoryGame(),
    () => setupSnakeGame(),
    () => setupBrandNavigation()
  ];

  // Execute tasks in batches using requestIdleCallback for better performance
  const executeTasks = (taskList) => {
    if (taskList.length === 0) return;
    
    const executeNextBatch = () => {
      const batchSize = 3; // Process 3 tasks at a time
      const batch = taskList.splice(0, batchSize);
      
      batch.forEach(task => {
        try {
          task();
        } catch (error) {
          console.error('Error executing task:', error);
        }
      });
      
      if (taskList.length > 0) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(executeNextBatch);
        } else {
          setTimeout(executeNextBatch, 0);
        }
      }
    };
    
    executeNextBatch();
  };

  executeTasks([...tasks]);
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
  const errorElements = document.querySelectorAll('.field-error');
  errorElements.forEach(error => error.remove());
}

function showFieldError(fieldId, message) {
  clearFormErrors();
  const field = document.getElementById(fieldId);
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
  const gamesSection = document.getElementById('gamesSection');
  const ticTacToeGame = document.getElementById('ticTacToeGame');
  const memoryGame = document.getElementById('memoryGame');
  const snakeGame = document.getElementById('snakeGame');
  
  // Hide all sections first
  heroSection.style.display = 'none';
  gamesSection.style.display = 'none';
  ticTacToeGame.style.display = 'none';
  memoryGame.style.display = 'none';
  snakeGame.style.display = 'none';
  
  // Update URL and history
  if (addToHistory) {
    history.pushState({ section }, '', `#${section}`);
  }
  
  // Show appropriate section and create content
  switch (section) {
    case 'home':
      heroSection.style.display = 'block';
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
      updateHeroContent('home');
  }
  
  // Update active nav link
  updateActiveNavLink(section);
}

function updateHeroContent(section) {
  const heroTitle = document.querySelector('.hero-section h2');
  const heroText = document.querySelector('.hero-section p');
  const getStartedBtn = document.getElementById('getStartedBtn');
  const learnMoreBtn = document.getElementById('learnMoreBtn');
  const emojiBtn = document.getElementById('emojiBtn');
  
  const content = {
    home: {
      title: "Welcome to Sahil's Website",
      text: "Experience the future of web applications with our sleek and modern interface."
    },
    features: {
      title: "Amazing Features",
      text: "Discover powerful tools and capabilities designed to enhance your experience with cutting-edge technology."
    },
    about: {
      title: "About Sahil's Website",
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
      <span style="font-size:1.2em;">✨ Explore, play, and enjoy!</span>`
    },
    contact: {
      title: "Get In Touch",
      text: "Ready to start your journey? Contact us today and let's build something amazing together."
    }
  };
  
  const sectionContent = content[section] || content.home;
  
  heroTitle.textContent = sectionContent.title;
  heroText.innerHTML = sectionContent.text;
  
  // Keep buttons consistent - always show "Get Started" and "Learn More"
  getStartedBtn.style.display = 'inline-flex';
  getStartedBtn.textContent = 'Get Started';
  learnMoreBtn.style.display = 'inline-flex';
  learnMoreBtn.textContent = 'Learn More';
  emojiBtn.style.display = 'none';
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

// Modal Management
function setupModalHandlers() {
  // Setup modal handlers if needed in the future
  console.log('Modal handlers initialized');
}

function openModal(modal) {
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
  
  // Focus first input
  setTimeout(() => {
    const firstInput = modal.querySelector('input');
    if (firstInput) firstInput.focus();
  }, 100);
}

// Mobile Menu - Only initialize on mobile devices
function setupMobileMenu() {
  // Get all mobile menu elements
  const mobileToggle = document.getElementById('mobileToggle');
  const mobileSlideMenu = document.getElementById('mobileSlideMenu');
  const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
  const mobileMenuClose = document.getElementById('mobileMenuClose');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');

  // Check if this is a mobile device
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  
  if (!isMobile) {
    // On desktop, ensure mobile menu elements are hidden
    if (mobileSlideMenu) mobileSlideMenu.style.display = 'none';
    if (mobileMenuOverlay) mobileMenuOverlay.style.display = 'none';
    if (mobileToggle) mobileToggle.style.display = 'none';
    return; // Exit early on desktop
  }

  // Only proceed if mobile elements exist
  if (!mobileToggle || !mobileSlideMenu || !mobileMenuOverlay || !mobileMenuClose) {
    return;
  }

  // Ensure menu starts closed on mobile
  mobileSlideMenu.classList.remove('active');
  mobileMenuOverlay.classList.remove('active');
  mobileToggle.classList.remove('active');
  document.body.style.overflow = 'auto';

  // Open mobile menu with dynamic animations
  function openMobileMenu() {
    // Show elements first
    mobileSlideMenu.classList.add('active');
    mobileMenuOverlay.classList.add('active');
    mobileToggle.classList.add('active');
    
    document.body.style.overflow = 'hidden';
  }

  // Close mobile menu with dynamic animations
  function closeMobileMenu() {
    mobileSlideMenu.classList.remove('active');
    mobileMenuOverlay.classList.remove('active');
    mobileToggle.classList.remove('active');
    
    document.body.style.overflow = 'auto';
  }

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

  // Handle window resize to ensure proper menu visibility
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const isNowMobile = window.matchMedia('(max-width: 768px)').matches;
      
      if (!isNowMobile) {
        // Switched to desktop - hide mobile menu elements
        closeMobileMenu();
        if (mobileSlideMenu) {
          mobileSlideMenu.style.display = 'none';
          mobileSlideMenu.classList.remove('active');
        }
        if (mobileMenuOverlay) {
          mobileMenuOverlay.style.display = 'none';
          mobileMenuOverlay.classList.remove('active');
        }
        if (mobileToggle) {
          mobileToggle.style.display = 'none';
          mobileToggle.classList.remove('active');
        }
      } else {
        // Switched to mobile - show mobile menu elements but keep them closed
        if (mobileSlideMenu) {
          mobileSlideMenu.style.display = 'flex';
          mobileSlideMenu.classList.remove('active'); // Ensure it starts closed
        }
        if (mobileMenuOverlay) {
          mobileMenuOverlay.style.display = 'block';
          mobileMenuOverlay.classList.remove('active'); // Ensure it starts closed
        }
        if (mobileToggle) {
          mobileToggle.style.display = 'flex';
          mobileToggle.classList.remove('active'); // Ensure it starts closed
        }
      }
    }, 100);
  });
}

// Form Handlers (simplified for Google Auth)
function setupFormHandlers() {
  // No form handlers needed
  console.log('Form handlers initialized');
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
  // Only enable dynamic background on desktop devices for better performance
  const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  if (!isDesktop || prefersReducedMotion) {
    // Set static background position for mobile/reduced motion
    document.documentElement.style.setProperty('--mouse-x', '50%');
    document.documentElement.style.setProperty('--mouse-y', '50%');
    return;
  }

  let mouseX = 50; // Start at center
  let mouseY = 50;
  let targetX = 50;
  let targetY = 50;
  let isAnimating = false;
  
  // Throttled mouse movement tracking for better performance
  let mouseMoveTimer;
  document.addEventListener('mousemove', (e) => {
    targetX = (e.clientX / window.innerWidth) * 100;
    targetY = (e.clientY / window.innerHeight) * 100;
    
    // Clear existing timer
    if (mouseMoveTimer) {
      clearTimeout(mouseMoveTimer);
    }
    
    // Start animation if not already running
    if (!isAnimating) {
      updateBackground();
    }
    
    // Stop animation after 100ms of no mouse movement
    mouseMoveTimer = setTimeout(() => {
      isAnimating = false;
    }, 100);
  });
  
  // Optimized animation loop
  function updateBackground() {
    if (!isAnimating) {
      isAnimating = true;
    }
    
    // Smooth interpolation for fluid movement
    const lerpFactor = 0.08; // Slightly slower for smoother effect
    mouseX += (targetX - mouseX) * lerpFactor;
    mouseY += (targetY - mouseY) * lerpFactor;
    
    // Update CSS custom properties only if there's significant change
    const threshold = 0.1;
    if (Math.abs(targetX - mouseX) > threshold || Math.abs(targetY - mouseY) > threshold) {
      document.documentElement.style.setProperty('--mouse-x', `${mouseX}%`);
      document.documentElement.style.setProperty('--mouse-y', `${mouseY}%`);
      requestAnimationFrame(updateBackground);
    } else {
      isAnimating = false;
    }
  }
  
  // Optimized parallax effect for hero content (desktop only)
  const heroSection = document.querySelector('.hero-section');
  if (heroSection) {
    let parallaxTimer;
    document.addEventListener('mousemove', (e) => {
      if (parallaxTimer) {
        clearTimeout(parallaxTimer);
      }
      
      parallaxTimer = setTimeout(() => {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.005; // Reduced intensity
        const moveY = (e.clientY - window.innerHeight / 2) * 0.005;
        
        heroSection.style.transform = `translate(${moveX}px, ${moveY}px)`;
      }, 16); // ~60fps throttling
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
  const learnMoreBtn = document.getElementById('learnMoreBtn');
  const emojiBtn = document.getElementById('emojiBtn');
  const backToHero = document.getElementById('backToHero');
  const backToGames = document.getElementById('backToGames');
  const ticTacToeCard = document.getElementById('ticTacToeCard');
  const memoryGameCard = document.getElementById('memoryGameCard');
  const snakeGameCard = document.getElementById('snakeGameCard');
  const backToGamesFromMemory = document.getElementById('backToGamesFromMemory');
  const backToGamesFromSnake = document.getElementById('backToGamesFromSnake');

  // Show games menu when "Get Started" is clicked 
  getStartedBtn.addEventListener('click', () => {
    const currentHash = window.location.hash || '#home';
    if (currentHash === '#home') {
      navigateToSection('games', true);
      showNotification('Welcome to the Games Menu! 🎮', 'success');
    } else {
      // From other sections, navigate to games
      navigateToSection('games', true);
      showNotification('Welcome to the Games Menu! 🎮', 'success');
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

  // Add 3D card effect with mouse movement (optimized for performance)
  function add3DCardEffect() {
    // Only enable 3D effects on desktop devices
    const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (!isDesktop || prefersReducedMotion) {
      return; // Skip 3D effects on mobile or for users who prefer reduced motion
    }

    const cardRect = card.getBoundingClientRect();
    let isHovering = false;
    let animationFrame = null;

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
        
        // Cancel any pending animation frame
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
        
        card.style.transition = 'transform 0.4s ease-out, box-shadow 0.4s ease-out';
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
        card.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';
      }
    });

    // Throttled mouse move handler for better performance
    let lastUpdateTime = 0;
    card.addEventListener('mousemove', (e) => {
      if (!isHovering) return;

      const now = performance.now();
      if (now - lastUpdateTime < 16) return; // Throttle to ~60fps
      lastUpdateTime = now;

      // Cancel previous animation frame
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      animationFrame = requestAnimationFrame(() => {
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
        const sensitivity = isOverSocialLink ? 0.4 : 0.8; // Reduced overall intensity
        
        // Calculate rotation angles
        const rotateX = (mouseY / rect.height) * -15 * sensitivity; // Reduced from -20
        const rotateY = (mouseX / rect.width) * 15 * sensitivity; // Reduced from 20
        
        // Calculate elevation based on distance from center
        const distance = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
        const maxDistance = Math.sqrt((rect.width/2) * (rect.width/2) + (rect.height/2) * (rect.height/2));
        const elevation = Math.max(0, (1 - distance / maxDistance) * 8 * sensitivity); // Reduced from 12
        
        // Apply 3D transform
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${elevation}px)`;
        
        // Enhanced shadow based on elevation and tilt
        const shadowBlur = 8 + elevation * 1.5;
        const shadowOpacity = 0.18 + elevation * 0.015;
        const shadowOffsetX = rotateY * 0.3;
        const shadowOffsetY = 8 + Math.abs(rotateX) * 0.3;
        
        card.style.boxShadow = `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(0,0,0,${shadowOpacity})`;
      });
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

  // Learn More button functionality
  if (learnMoreBtn) {
    learnMoreBtn.addEventListener('click', () => {
      navigateToSection('features', true);
      showNotification('Discover our amazing features! ✨', 'info');
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
  highScore: localStorage.getItem('snakeHighScore') || 0,
  gameActive: false,
  gameOver: false,
  gameLoop: null,
  lastMoveTime: 0,
  moveInterval: 150 // Move every 150ms for smooth gameplay - starts slower for better control
};

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
    localStorage.setItem('snakeHighScore', snakeGameState.highScore);
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
