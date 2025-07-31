// Client-side SQL-like database simulation using IndexedDB
class SQLUserDatabase {
  constructor() {
    this.dbName = 'UserDatabase';
    this.version = 1;
    this.db = null;
    this.initialized = false;
    this.initPromise = null;
  }

  async initializeDatabase() {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return immediately if already initialized
    if (this.initialized && this.db) {
      return Promise.resolve();
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => {
        console.error('Database failed to open:', request.error);
        this.initialized = false;
        reject(request.error);
      };
      
      request.onsuccess = async () => {
        this.db = request.result;
        this.initialized = true;
        console.log('IndexedDB opened successfully');
        
        // Set up error handler for the database
        this.db.onerror = (event) => {
          console.error('Database error:', event.target.error);
        };
        
        try {
          await this.createDemoUser();
          resolve();
        } catch (error) {
          console.warn('Could not create demo user:', error);
          resolve(); // Still resolve as DB is working
        }
      };
      
      request.onupgradeneeded = (e) => {
        this.db = e.target.result;
        
        // Create users object store if it doesn't exist
        if (!this.db.objectStoreNames.contains('users')) {
          const usersStore = this.db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
          usersStore.createIndex('email', 'email', { unique: true });
          usersStore.createIndex('name', 'name', { unique: false });
          console.log('Created users object store');
        }
        
        // Create sessions object store if it doesn't exist
        if (!this.db.objectStoreNames.contains('sessions')) {
          const sessionsStore = this.db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
          sessionsStore.createIndex('user_id', 'user_id', { unique: false });
          console.log('Created sessions object store');
        }
      };
    });

    return this.initPromise;
  }

  async ensureInitialized() {
    if (!this.initialized || !this.db) {
      await this.initializeDatabase();
    }
    if (!this.initialized || !this.db) {
      throw new Error('Database not available');
    }
  }

  async createDemoUser() {
    try {
      const users = await this.getAllUsers();
      if (users.length === 0) {
        await this.createUser({
          name: 'Demo User',
          email: 'demo@example.com',
          password: 'demo123'
        });
        console.log('Demo user created: email: demo@example.com, password: demo123');
      }
    } catch (error) {
      console.warn('Could not create demo user:', error);
    }
  }

  // Check if email exists in database
  async emailExists(email) {
    try {
      await this.ensureInitialized();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['users'], 'readonly');
        const store = transaction.objectStore('users');
        const index = store.index('email');
        const request = index.get(email.toLowerCase());
        
        request.onsuccess = () => {
          resolve(request.result);
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.warn('IndexedDB emailExists failed:', error);
      throw error;
    }
  }

  // Create new user
  async createUser(userData) {
    try {
      await this.ensureInitialized();
      
      return new Promise(async (resolve, reject) => {
        try {
          // Check if email already exists
          const existingUser = await this.emailExists(userData.email);
          if (existingUser) {
            reject(new Error('Email already exists'));
            return;
          }

          const transaction = this.db.transaction(['users'], 'readwrite');
          const store = transaction.objectStore('users');
          
          const newUser = {
            name: userData.name,
            email: userData.email.toLowerCase(),
            password: userData.password, // In production, this should be hashed
            created_at: new Date().toISOString()
          };
          
          const request = store.add(newUser);
          
          request.onsuccess = () => {
            newUser.id = request.result;
            console.log('User created successfully in IndexedDB:', newUser.email);
            resolve(newUser);
          };
          
          request.onerror = () => {
            console.error('Failed to create user in IndexedDB:', request.error);
            reject(request.error);
          };
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      console.warn('IndexedDB createUser failed:', error);
      throw error;
    }
  }

  // Authenticate user with exact match
  async authenticateUser(email, password) {
    try {
      await this.ensureInitialized();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['users'], 'readonly');
        const store = transaction.objectStore('users');
        const index = store.index('email');
        const request = index.get(email.toLowerCase());
        
        request.onsuccess = () => {
          const user = request.result;
          if (user && user.password === password) {
            // Return user without password
            const { password: _, ...userWithoutPassword } = user;
            console.log('User authenticated successfully from IndexedDB:', user.email);
            resolve(userWithoutPassword);
          } else {
            console.log('Authentication failed for email:', email);
            resolve(null);
          }
        };
        
        request.onerror = () => {
          console.error('Authentication query failed:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.warn('IndexedDB authenticateUser failed:', error);
      throw error;
    }
  }

  // Get all users (for admin purposes)
  async getAllUsers() {
    try {
      await this.ensureInitialized();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['users'], 'readonly');
        const store = transaction.objectStore('users');
        const request = store.getAll();
        
        request.onsuccess = () => {
          // Return users without passwords
          const users = request.result.map(user => {
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
          });
          resolve(users);
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.warn('IndexedDB getAllUsers failed:', error);
      throw error;
    }
  }

  // Session management
  async setCurrentUser(user) {
    try {
      await this.ensureInitialized();
      
      // Clear existing sessions
      await this.clearCurrentUser();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        
        const session = {
          user_id: user.id,
          created_at: new Date().toISOString()
        };
        
        const request = store.add(session);
        
        request.onsuccess = () => {
          // Also store in localStorage for immediate access
          localStorage.setItem('current_user', JSON.stringify(user));
          console.log('User session created:', user.email);
          resolve();
        };
        
        request.onerror = () => {
          console.error('Failed to create session:', request.error);
          // Fallback to localStorage only
          localStorage.setItem('current_user', JSON.stringify(user));
          resolve();
        };
      });
    } catch (error) {
      console.warn('IndexedDB setCurrentUser failed, using localStorage:', error);
      // Fallback to localStorage
      localStorage.setItem('current_user', JSON.stringify(user));
    }
  }

  getCurrentUser() {
    // Check localStorage for immediate access
    const localUser = localStorage.getItem('current_user');
    if (localUser) {
      return JSON.parse(localUser);
    }
    return null;
  }

  async clearCurrentUser() {
    try {
      await this.ensureInitialized();
      
      // Clear database sessions
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        const request = store.clear();
        
        request.onsuccess = () => {
          // Clear localStorage
          localStorage.removeItem('current_user');
          console.log('User session cleared');
          resolve();
        };
        
        request.onerror = () => {
          console.error('Failed to clear sessions:', request.error);
          // Still clear localStorage
          localStorage.removeItem('current_user');
          resolve();
        };
      });
    } catch (error) {
      console.warn('IndexedDB clearCurrentUser failed:', error);
      // Fallback to localStorage
      localStorage.removeItem('current_user');
    }
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

export default SQLUserDatabase;
