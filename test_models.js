const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function testModels() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    const key = config.geminiApiKey;
    
    const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const models = response.data.models
      .filter(m => m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
      
    console.log('Model yang tersedia:', models);
  } catch (err) {
    console.error('Error fetching models:', err.response?.data || err.message);
  }
}

testModels();
