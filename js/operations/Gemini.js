
var model = 'gemini-2.5-pro';
async function callGeminiApi(prompt, apiKey) {
 
  var request = `Generate SVG path data for "${prompt}" as proper line work suitable for CNC machining.

  Requirements:
  - Return ONLY valid SVG markup starting with <svg> tag, no other text or explanation
  - SVG dimensions: 500x500 units with viewBox="0 0 500 500"
  - Use stroke-based elements: <path>, <polyline>, <line>, <circle>, <ellipse>, <rect>
  - All elements must have stroke (no fill): use fill="none" stroke="black" stroke-width="2"
  - Create detailed, well-defined contours and features
  - For 3D objects, draw visible edges and contours as separate paths
  - Include internal details and features, not just outlines
  - Properly handle overlapping elements by clipping paths and omitting hidden lines


  Create a detailed technical drawing style representation, not a simplified icon.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const requestBody = {
    contents: [{
      parts: [{
        text: request
      }]
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${response.status} - ${error.error.message}`);
    }

    const data = await response.json();
    // Assuming a successful response with text content in the first candidate
    return data.candidates[0].content.parts[0].text;

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return null;
  }
}

function applyGemini() {



    var apiKey = document.getElementById('pm-apiKey').value;
    if (!apiKey || apiKey.trim() === '') {
        notify("Please enter a Gemini API key");
        return;
    }
    localStorage.setItem('gemini-key', apiKey);

    var prompt = document.getElementById('pm-prompt').value;
    if (!prompt || prompt.trim() === '') {
        notify("Please enter a prompt");
        return;
    }

    // Show loading indicator
    document.getElementById('gemini-apply-button').innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...';
    document.getElementById('gemini-apply-button').disabled = true;

    callGeminiApi(prompt, apiKey).then(generatedText => {
        if (generatedText) {
            // Process the generated text (assuming it's SVG path data)
            const regex = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;

            const match = generatedText.match(regex);

            // If a match is found, return the first one. Otherwise, return null.
            var svgText =  match ? match[0] : null;
            try {
                    parseSvgContent(svgText,"Gemini");
                    
            } catch (e) {
                console.error("Error processing generated text:", e);
                notify("Gemini: Error processing generated text");
            }
        } else {
            notify("Gemini: No response from API");
        }
    }).catch(error => {
        console.error("Error calling Gemini API:", error);
        notify("Gemini: Error calling API");
    }).finally(() => {
        // Restore button state
        document.getElementById('gemini-apply-button').innerHTML = '<i data-lucide="check"></i> Apply';
        document.getElementById('gemini-apply-button').disabled = false;
    });
   
}

class Gemini extends Operation {
    constructor() {
        super('Gemini', 'brain', 'Generate SVG paths from text prompt using Gemini AI');

        this.fields = {
            apiKey: { key: 'apiKey', label: 'Gemini API Key', type: 'text', default: '',
                      help: 'Get your key at aistudio.google.com' },
            prompt: { key: 'prompt', label: 'Prompt',         type: 'text', default: 'A rectangle' },
        };
    }

    getPropertiesHTML() {
        const apiKey = localStorage.getItem('gemini-key') || '';
        const prompt = this.properties.prompt || 'A rectangle';

        return `
            <div class="alert alert-info mb-3">
                <strong>Gemini AI</strong><br>
                Generate SVG paths from text prompt using Gemini AI
            </div>
            ${PropertiesManager.fieldHTML(this.fields.apiKey, apiKey)}
            ${PropertiesManager.fieldHTML(this.fields.prompt, prompt)}
            <div class="mb-3">
                <button type="button" class="btn btn-primary btn-sm w-100" id="gemini-apply-button" onclick="applyGemini()">
                    <i data-lucide="check"></i> Apply
                </button>
                <div class="form-text">Enter a prompt then click Apply to generate paths</div>
            </div>`;
    }

    onPropertiesChanged(data) {
        this.properties = { ...this.properties, ...data };
        super.onPropertiesChanged(data);
    }
}
