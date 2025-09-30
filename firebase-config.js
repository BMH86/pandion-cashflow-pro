// Firebase Configuration and Initialization
// Follow setup instructions in comments below

/*
FIREBASE SETUP INSTRUCTIONS:
1. Go to https://console.firebase.google.com/
2. Create a new project: "Pandion Cashflow Pro"
3. Enable Authentication > Email/Password
4. Enable Firestore Database
5. In Project Settings > General, copy your config object
6. Replace the firebaseConfig below with your actual values
7. In Firestore Rules, use the rules at the bottom of this file
*/

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCviNwLVxsLSQjblNPIh1hl_JfCWlmzGyw",
  authDomain: "pandion-cashflow-pro.firebaseapp.com",
  projectId: "pandion-cashflow-pro",
  storageBucket: "pandion-cashflow-pro.firebasestorage.app",
  messagingSenderId: "1041555626841",
  appId: "1:1041555626841:web:41bc36ae1434c40165ca48",
  measurementId: "G-BWVHK93P9Y"
};

// Initialize Firebase
let auth, db;

try {
  const firebaseApp = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  if (typeof window !== 'undefined') {
    window.firebaseApp = firebaseApp;
  }
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
}

// Authentication State Management
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.userRole = null;
    this.onAuthStateChangedCallbacks = [];
    
    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
      this.currentUser = user;
      if (user) {
        this.loadUserRole();
      } else {
        this.userRole = null;
      }
      this.notifyAuthStateChanged(user);
    });
  }

  // Load user role from Firestore
  async loadUserRole() {
    try {
      const userDoc = await db.collection('users').doc(this.currentUser.uid).get();
      if (userDoc.exists) {
        this.userRole = userDoc.data().role || 'user';
      } else {
        // First time user - set as regular user
        this.userRole = 'user';
        await db.collection('users').doc(this.currentUser.uid).set({
          email: this.currentUser.email,
          role: 'user',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      console.log(`User role loaded: ${this.userRole}`);
    } catch (error) {
      console.error('Error loading user role:', error);
      this.userRole = 'user'; // Default to regular user on error
    }
  }

  // Check if current user is super admin
  isSuperAdmin() {
    return this.userRole === 'super_admin';
  }

  // Sign in with email/password
  async signIn(email, password) {
    try {
      const result = await auth.signInWithEmailAndPassword(email, password);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, error: this.getErrorMessage(error.code) };
    }
  }

  // Sign out
  async signOut() {
    try {
      await auth.signOut();
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  }

  // Register auth state change callback
  onAuthStateChanged(callback) {
    this.onAuthStateChangedCallbacks.push(callback);
  }

  // Notify all callbacks of auth state change
  notifyAuthStateChanged(user) {
    this.onAuthStateChangedCallbacks.forEach(callback => callback(user));
  }

  // Get user-friendly error messages
  getErrorMessage(errorCode) {
    const errorMessages = {
      'auth/invalid-email': 'Invalid email address',
      'auth/user-disabled': 'This account has been disabled',
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later',
      'auth/network-request-failed': 'Network error. Please check your connection'
    };
    return errorMessages[errorCode] || 'Authentication failed. Please try again.';
  }
}

// Firebase Storage Manager - Replaces localStorage
class FirebaseStorageManager {
  constructor() {
    this.projectsCollection = 'projects';
    this.settingsCollection = 'settings';
  }

  // Save project to Firebase
  async saveProject(projectId, projectData) {
    try {
      await db.collection(this.projectsCollection).doc(projectId).set({
        ...projectData,
        lastModified: firebase.firestore.FieldValue.serverTimestamp(),
        modifiedBy: auth.currentUser?.uid || 'unknown'
      }, { merge: true });
      
      console.log(`✅ Project saved: ${projectId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error saving project:', error);
      return { success: false, error: error.message };
    }
  }

  // Load single project
  async loadProject(projectId) {
    try {
      const doc = await db.collection(this.projectsCollection).doc(projectId).get();
      if (doc.exists) {
        return { success: true, data: doc.data() };
      } else {
        return { success: false, error: 'Project not found' };
      }
    } catch (error) {
      console.error('❌ Error loading project:', error);
      return { success: false, error: error.message };
    }
  }

  // Load all projects
  async loadAllProjects() {
    try {
      const snapshot = await db.collection(this.projectsCollection)
        .orderBy('lastModified', 'desc')
        .limit(50) // Limit to 50 most recent projects
        .get();
      
      const projects = {};
      snapshot.forEach(doc => {
        projects[doc.id] = doc.data();
      });
      
      console.log(`✅ Loaded ${Object.keys(projects).length} projects`);
      return { success: true, data: projects };
    } catch (error) {
      console.error('❌ Error loading projects:', error);
      return { success: false, error: error.message };
    }
  }

  // Delete project (super admin only)
  async deleteProject(projectId) {
    try {
      if (!authManager.isSuperAdmin()) {
        throw new Error('Only super admin can delete projects');
      }
      
      await db.collection(this.projectsCollection).doc(projectId).delete();
      console.log(`✅ Project deleted: ${projectId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error deleting project:', error);
      return { success: false, error: error.message };
    }
  }

  // Real-time listener for project updates
  subscribeToProject(projectId, callback) {
    return db.collection(this.projectsCollection).doc(projectId)
      .onSnapshot((doc) => {
        if (doc.exists) {
          callback({ success: true, data: doc.data() });
        } else {
          callback({ success: false, error: 'Project not found' });
        }
      }, (error) => {
        console.error('❌ Error in project subscription:', error);
        callback({ success: false, error: error.message });
      });
  }

  // Real-time listener for all projects
  subscribeToAllProjects(callback) {
    return db.collection(this.projectsCollection)
      .orderBy('lastModified', 'desc')
      .onSnapshot((snapshot) => {
        const projects = {};
        snapshot.forEach(doc => {
          projects[doc.id] = doc.data();
        });
        callback({ success: true, data: projects });
      }, (error) => {
        console.error('❌ Error in projects subscription:', error);
        callback({ success: false, error: error.message });
      });
  }

  // Save user settings
  async saveSettings(userId, settings) {
    try {
      await db.collection(this.settingsCollection).doc(userId).set(settings, { merge: true });
      return { success: true };
    } catch (error) {
      console.error('❌ Error saving settings:', error);
      return { success: false, error: error.message };
    }
  }

  // Load user settings
  async loadSettings(userId) {
    try {
      const doc = await db.collection(this.settingsCollection).doc(userId).get();
      if (doc.exists) {
        return { success: true, data: doc.data() };
      }
      return { success: true, data: {} };
    } catch (error) {
      console.error('❌ Error loading settings:', error);
      return { success: false, error: error.message };
    }
  }
}

// Initialize managers
const authManager = new AuthManager();
const firebaseStorage = new FirebaseStorageManager();

// Export for use in other files
window.authManager = authManager;
window.firebaseStorage = firebaseStorage;
window.firebase = firebase;
window.db = db;

/*
FIRESTORE SECURITY RULES:
Copy these rules to your Firebase Console > Firestore Database > Rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - users can read their own data
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Projects collection - all authenticated users can read and write
    match /projects/{projectId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null;
      allow delete: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin';
    }
    
    // Settings collection - users can access their own settings
    match /settings/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}

INITIAL SUPER ADMIN SETUP:
1. Create your first user account through the login screen
2. Go to Firebase Console > Firestore Database
3. Find the 'users' collection
4. Find your user document (by email)
5. Edit the 'role' field and change it to 'super_admin'
6. Refresh the app - you now have super admin privileges

ADDING MORE USERS:
- Super admin can manage users through the app (we'll add this UI)
- Or manually add users in Firebase Console > Authentication
*/
