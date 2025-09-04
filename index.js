const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");

// Initialize Firebase Admin
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// ----------------------------
// Store device tokens
const tokensCollection = db.collection("deviceTokens");

// Register device token
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

// Unsubscribe device token
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
// Send alert
// Send alert
app.post("/api/send-alert", async (req, res) => {
  const { type, message, name } = req.body;
  if (!type || !message || !name)
    return res.status(400).send({ error: "Missing fields" });

  try {
    // Save alert to Firestore
    const alertRef = await db.collection("alerts").add({
      name,
      type,
      message,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // Fetch all device tokens
    const snapshot = await tokensCollection.get();
    const tokens = snapshot.docs.map((doc) => doc.id);

    if (tokens.length > 0) {
      const messaging = admin.messaging();
      const payload = {
        notification: {
          title: type === "panic" ? "Lockdown Alert!" : "Suspicious Alert",
          body:
            type === "panic"
              ? "This is a Lockdown. Please follow the Lockdown Procedure Immediately."
              : message,
        },
        data: {
          type, // 👈 send type so SW can handle sound
        },
        tokens,
      };

      // Send push notifications
      const response = await messaging.sendEachForMulticast(payload);
      console.log(
        "Push notifications sent:",
        response.successCount,
        "success,",
        response.failureCount,
        "failures"
      );

      // 🔥 Clean up invalid tokens
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const failedToken = tokens[idx];
          console.warn("Removing invalid token:", failedToken);
          tokensCollection.doc(failedToken).delete().catch(console.error);
        }
      });
    }

    res.send({ success: true, id: alertRef.id });
  } catch (err) {
    console.error("Failed to send alert:", err);
    res.status(500).send({ error: "Failed to send alert" });
  }
});



// Get alerts
app.get("/api/alerts", async (req, res) => {
  try {
    const snapshot = await db.collection("alerts").orderBy("createdAt", "desc").get();
    const alerts = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        type: data.type,
        message: data.message,
        createdAt: data.createdAt?.toDate().toISOString(),
      };
    });
    res.send(alerts);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch alerts" });
  }
});

// Clear all alerts
app.post("/api/clear-alerts", async (req, res) => {
  try {
    const snapshot = await db.collection("alerts").get();
    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    res.send({ success: true });
  } catch (err) {
    console.error("Failed to clear alerts:", err);
    res.status(500).send({ error: "Failed to clear alerts" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
