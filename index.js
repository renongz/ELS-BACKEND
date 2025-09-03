const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");

// Initialize Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore(); // Firestore for alerts
const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 10000;

// ----------------------------
// Store device tokens
const tokensCollection = db.collection("deviceTokens");
app.post("/api/register-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send({ error: "Token missing" });

  try {
    await tokensCollection.doc(token).set({ token });
    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to save token" });
  }
});

// Unsubscribe token
app.post("/api/unsubscribe", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send({ error: "Token missing" });

  try {
    await tokensCollection.doc(token).delete();
    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to unsubscribe" });
  }
});

// ----------------------------
// Send alert (Admin)
app.post("/api/send-alert", async (req, res) => {
  const { type, message, name } = req.body; // type: "panic" or "suspicious"
  if (!type || !message || !name)
    return res.status(400).send({ error: "Missing fields" });

  try {
    // Save alert in Firestore
    const alertRef = await db.collection("alerts").add({
      name,
      type,
      message,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // Get all tokens
    const snapshot = await tokensCollection.get();
    const tokens = snapshot.docs.map((doc) => doc.id);

    if (tokens.length > 0) {
      // Send FCM notification
      const payload = {
        notification: {
          title: type === "panic" ? "Lockdown Alert!" : "Suspicious Alert",
          body:
            type === "panic"
              ? "This is a Lockdown. Please follow the Lockdown Procedure Immediately."
              : message,
        },
      };
      await admin.messaging().sendToDevice(tokens, payload);
    }

    res.send({ success: true, id: alertRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to send alert" });
  }
});

// ----------------------------
// Fetch alerts (Student)
app.get("/api/alerts", async (req, res) => {
  try {
    const snapshot = await db.collection("alerts").orderBy("createdAt", "desc").get();
    const alerts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.send(alerts);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch alerts" });
  }
});

// ----------------------------
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
