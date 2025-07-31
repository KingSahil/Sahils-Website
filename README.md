# Modern App Menu

A sleek and modern web application featuring a beautiful app menu with login and signup functionality.

## ✨ Features

- **Modern Design**: Beautiful gradient backgrounds and smooth animations
- **Responsive Layout**: Works perfectly on desktop, tablet, and mobile devices
- **Interactive Menu**: Smooth navigation with hover effects
- **Authentication Modals**: Login and signup forms with validation
- **Toast Notifications**: User-friendly feedback messages
- **Mobile Menu**: Hamburger menu for mobile devices
- **Loading States**: Visual feedback during form submissions

## 🚀 Quick Start

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn package manager

### Installation

1. Clone or download this project
2. Navigate to the project directory
3. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the development server:
```bash
npm run dev
```

The application will open in your browser at `http://localhost:3000`

### Build for Production

Create a production build:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## 🎨 Design Features

### Color Scheme
- Primary: Gradient from #667eea to #764ba2
- Text: #2d3748 (primary), #718096 (secondary)
- Background: White with glassmorphism effects

### Typography
- Font Family: Inter (with system font fallbacks)
- Responsive font sizes
- Proper font weights for hierarchy

### Animations
- Smooth transitions (300ms cubic-bezier)
- Hover effects on buttons and links
- Modal slide-in animations
- Loading spinners

## 📱 Responsive Design

The application adapts to different screen sizes:

- **Desktop (>768px)**: Full navigation menu with all features
- **Tablet (768px-480px)**: Condensed layout with hidden menu text
- **Mobile (<480px)**: Hamburger menu and stacked buttons

## 🔧 Customization

### Colors
Update the CSS custom properties in `style.css`:

```css
:root {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
  /* ... other variables */
}
```

### Branding
- Update the app name in `index.html` (nav-brand section)
- Modify the hero section content
- Add your own logo or favicon

### Functionality
- Customize form validation in `main.js`
- Add real API endpoints for authentication
- Extend the notification system

## 📁 Project Structure

```
├── index.html          # Main HTML file
├── style.css           # All styles and animations
├── main.js             # JavaScript functionality
├── vite.config.js      # Vite configuration
├── package.json        # Dependencies and scripts
└── README.md           # This file
```

## 🌟 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Feel free to fork this project and submit pull requests for improvements!

---

**Enjoy building with this modern app menu! 🎉**
