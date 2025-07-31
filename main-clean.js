// Simple, clean main.js for Sahil's Website
import './style.css'

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
  setupRouting();
});

function initializeApp() {
  setupMobileMenu();
  setupFormHandlers();
  setupScrollEffects();
  setupThemeToggle();
  setupButtonShimmer();
  setupGamesNavigation();
  setupTicTacToe();
  setupMemoryGame();
  setupSnakeGame();
  setupBrandNavigation();
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

// Mobile Menu
function setupMobileMenu() {
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

  // Handle window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const isNowMobile = window.matchMedia('(max-width: 768px)').matches;
      
      if (!isNowMobile) {
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
        if (mobileSlideMenu) {
          mobileSlideMenu.style.display = 'flex';
          mobileSlideMenu.classList.remove('active');
        }
        if (mobileMenuOverlay) {
          mobileMenuOverlay.style.display = 'block';
          mobileMenuOverlay.classList.remove('active');
        }
        if (mobileToggle) {
          mobileToggle.style.display = 'flex';
          mobileToggle.classList.remove('active');
        }
      }
    }, 100);
  });
}

// Form Handlers
function setupFormHandlers() {
  console.log('Form handlers initialized');
}

// Scroll Effects
function setupScrollEffects() {
  const header = document.querySelector('.app-header');
  let lastScrollY = window.scrollY;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    if (currentScrollY > 50) {
      header.style.background = isDark 
        ? 'rgba(26, 32, 44, 0.95)' 
        : 'rgba(255, 255, 255, 0.95)';
      header.style.backdropFilter = 'blur(10px)';
      header.style.boxShadow = 'var(--shadow-md)';
    } else {
      header.style.background = isDark 
        ? 'rgba(26, 32, 44, 0.8)' 
        : 'rgba(255, 255, 255, 0.8)';
      header.style.backdropFilter = 'blur(5px)';
      header.style.boxShadow = 'none';
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
    document.documentElement.setAttribute('data-theme', theme);
    document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
    
    // Update theme icon
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    
    // Save theme preference
    localStorage.setItem('theme', theme);
    
    // Update meta theme color
    const metaThemeColor = document.getElementById('theme-color-meta');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#1a202c' : '#667eea');
    }
  }
}

// Button Shimmer Effect
function setupButtonShimmer() {
  const buttons = document.querySelectorAll('.btn');
  
  buttons.forEach(button => {
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
    });
  });
}

// Games Navigation
function setupGamesNavigation() {
  const getStartedBtn = document.getElementById('getStartedBtn');
  const learnMoreBtn = document.getElementById('learnMoreBtn');
  const emojiBtn = document.getElementById('emojiBtn');
  const backToHero = document.getElementById('backToHero');
  
  // Get Started button - goes to games
  if (getStartedBtn) {
    getStartedBtn.addEventListener('click', () => {
      navigateToSection('games', true);
      showNotification('Welcome to the Games Menu! 🎮', 'success');
    });
  }

  // Learn More button - goes to features
  if (learnMoreBtn) {
    learnMoreBtn.addEventListener('click', () => {
      navigateToSection('features', true);
      showNotification('Discover our amazing features! ✨', 'info');
    });
  }

  // Back to Hero button
  if (backToHero) {
    backToHero.addEventListener('click', () => {
      navigateToSection('home', true);
    });
  }

  // Game cards
  const ticTacToeCard = document.getElementById('ticTacToeCard');
  const memoryGameCard = document.getElementById('memoryGameCard');
  const snakeGameCard = document.getElementById('snakeGameCard');

  if (ticTacToeCard) {
    ticTacToeCard.addEventListener('click', () => {
      navigateToSection('tic-tac-toe', true);
    });
  }

  if (memoryGameCard) {
    memoryGameCard.addEventListener('click', () => {
      navigateToSection('memory-game', true);
    });
  }

  if (snakeGameCard) {
    snakeGameCard.addEventListener('click', () => {
      navigateToSection('snake-game', true);
    });
  }

  // Back to games buttons
  const backToGames = document.getElementById('backToGames');
  const backToGamesFromMemory = document.getElementById('backToGamesFromMemory');
  const backToGamesFromSnake = document.getElementById('backToGamesFromSnake');

  [backToGames, backToGamesFromMemory, backToGamesFromSnake].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        navigateToSection('games', true);
      });
    }
  });
}

// Simple notification function
function showNotification(message, type = 'info') {
  console.log(`${type}: ${message}`);
}

// Brand Navigation
function setupBrandNavigation() {
  const brand = document.querySelector('.nav-brand h1');
  if (brand) {
    brand.addEventListener('click', () => {
      navigateToSection('home', true);
    });
    
    brand.style.cursor = 'pointer';
    brand.addEventListener('mouseenter', () => {
      brand.style.transform = 'scale(1.05)';
    });
    brand.addEventListener('mouseleave', () => {
      brand.style.transform = 'scale(1)';
    });
  }
}

// Placeholder functions for games (you can implement these)
function setupTicTacToe() {
  console.log('Tic Tac Toe initialized');
}

function setupMemoryGame() {
  console.log('Memory Game initialized');
}

function setupSnakeGame() {
  console.log('Snake Game initialized');
}

function resetTicTacToeGame() {
  console.log('Tic Tac Toe reset');
}

function resetMemoryGame() {
  console.log('Memory Game reset');
}

function resetSnakeGame() {
  console.log('Snake Game reset');
}
