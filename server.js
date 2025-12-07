const express = require('express');
const cors = require('cors');
const app = express();

// CORS configuration
const allowedOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => origin.includes(allowed))) {
      callback(null, true);
    } else {
      callback(null, allowedOrigins[0]); // Default to first allowed origin
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API: Create checkout (Yoco payment)
app.post('/api/create-checkout', async (req, res) => {
  const { amount, currency } = req.body;
  
  if (!amount || !currency) {
    return res.status(400).json({ error: 'Missing amount or currency' });
  }

  if (!process.env.YOCO_SECRET_KEY) {
    return res.status(500).json({ error: 'YOCO_SECRET_KEY not configured' });
  }

  try {
    const yocoResponse = await fetch('https://online.yoco.com/v1/checkout/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.YOCO_SECRET_KEY}`
      },
      body: JSON.stringify({
        amount,
        currency,
        success_url: 'https://www.warmthly.org/payment-success',
        cancel_url: 'https://www.warmthly.org/payment-cancelled'
      })
    });

    if (!yocoResponse.ok) {
      const error = await yocoResponse.text();
      return res.status(yocoResponse.status).json({ error });
    }

    const data = await yocoResponse.json();
    res.json({ id: data.id });
  } catch (error) {
    console.error('Error creating checkout:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API: i18n - Get available languages
app.get('/api/i18n/languages', (req, res) => {
  // Basic implementation - you can expand this later
  res.json({ 
    languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko', 'ar'] 
  });
});

// API: i18n - Get translations for a language
app.get('/api/i18n/:language', (req, res) => {
  const { language } = req.params;
  
  // Basic manual translations (expand later)
  const translations = {
    en: {
      common: {
        loading: "Loading...",
        error: "Error",
        success: "Success"
      },
      main: {
        title: "Rehumanize Our World.",
        subtitle: "Warmthly is a global movement to make empathy a measurable part of our systems."
      }
    }
  };

  const langTranslations = translations[language] || translations.en;
  res.json({ 
    translations: langTranslations,
    version: '1.0.0'
  });
});

// API: i18n - Get translation chunk
app.post('/api/i18n/:language/chunk', (req, res) => {
  const { language } = req.params;
  const { keys } = req.body;
  
  // Basic implementation
  res.json({
    translations: {},
    keys: keys || [],
    total: 0
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 80;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Warmthly API server running on port ${PORT}`);
});

