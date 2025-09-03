// els_backend/firebase.js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Make sure this JSON is in backend

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const messaging = admin.messaging();

module.exports = { admin, db, messaging };
