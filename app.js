import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai';

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const newBtn = document.getElementById('newBtn');
const recordingIndicator = document.getElementById('recordingIndicator');
const loadingSpinner = document.getElementById('loadingSpinner');
const resultsSection = document.getElementById('resultsSection');
const resultsContent = document.getElementById('resultsContent');
const tabMom = document.getElementById('tabMom');
const tabActionItems = document.getElementById('tabActionItems');
const tabEmailDraft = document.getElementById('tabEmailDraft');
const tabAnalytics = document.getElementById('tabAnalytics');
const tabTranscript = document.getElementById('tabTranscript');
const tabInsights = document.getElementById('tabInsights');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportModal = document.getElementById('exportModal');
const cancelExportBtn = document.getElementById('cancelExportBtn');
const confirmExportBtn = document.getElementById('confirmExportBtn');
const recordingTimer = document.getElementById('recordingTimer');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyCheck = document.getElementById('saveKeyCheck');
const chatFab = document.getElementById('chatFab');
const chatWidget = document.getElementById('chatWidget');
const closeChatBtn = document.getElementById('closeChatBtn');
const liveInsightsSection = document.getElementById('liveInsightsSection');
const liveInsightStatus = document.getElementById('liveInsightStatus');
const liveInsightList = document.getElementById('liveInsightList');
const cardMicOnly = document.getElementById('cardMicOnly');
const cardTabAudio = document.getElementById('cardTabAudio');
const cardMeetingOnly = document.getElementById('cardMeetingOnly');

if (cardMicOnly && cardTabAudio && cardMeetingOnly) {
    cardMicOnly.addEventListener('click', () => {
        cardMicOnly.classList.add('active');
        cardTabAudio.classList.remove('active');
        cardMeetingOnly.classList.remove('active');
    });

    cardTabAudio.addEventListener('click', () => {
        cardTabAudio.classList.add('active');
        cardMicOnly.classList.remove('active');
        cardMeetingOnly.classList.remove('active');
    });

    cardMeetingOnly.addEventListener('click', () => {
        cardMeetingOnly.classList.add('active');
        cardMicOnly.classList.remove('active');
        cardTabAudio.classList.remove('active');
    });
}

let consecutiveSilences = 0;
let chunkCount = 0;

chatFab.addEventListener('click', () => {
    chatWidget.classList.toggle('collapsed');
});

closeChatBtn.addEventListener('click', () => {
    chatWidget.classList.add('collapsed');
});

const savedKey = localStorage.getItem('gemini_api_key');
if (savedKey) {
    apiKeyInput.value = savedKey;
    saveKeyCheck.checked = true;
}

saveKeyCheck.addEventListener('change', () => {
    if (saveKeyCheck.checked && apiKeyInput.value) {
        localStorage.setItem('gemini_api_key', apiKeyInput.value);
    } else {
        localStorage.removeItem('gemini_api_key');
    }
});

apiKeyInput.addEventListener('input', () => {
    if (saveKeyCheck.checked) {
        if (apiKeyInput.value) {
            localStorage.setItem('gemini_api_key', apiKeyInput.value);
        } else {
            localStorage.removeItem('gemini_api_key');
        }
    }
    
    // Clear any existing API errors when the user starts typing a new key
    if (typeof clearApiError === 'function') {
        clearApiError();
    }
    validateStartButton();
});

function validateStartButton() {
    const key = apiKeyInput.value.trim();
    
    if (!key) {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        startBtn.style.cursor = 'not-allowed';
        startBtn.title = 'Please provide a Gemini API Key first';
    } else {
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
        startBtn.title = '';
    }
}

// Initial check
validateStartButton();

const toggleApiKeyBtn = document.getElementById('toggleApiKeyBtn');
toggleApiKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleApiKeyBtn.innerHTML = '<i data-lucide="eye-off"></i>';
    } else {
        apiKeyInput.type = 'password';
        toggleApiKeyBtn.innerHTML = '<i data-lucide="eye"></i>';
    }
    lucide.createIcons(); // Initialize the new icon
});

let currentMom = "";
let currentActionItems = "";
let currentEmailDraft = "";
let currentTranscript = "";
let currentInsightsHtml = "";
let currentMeetingName = "";
let timerInterval;
let startTime;

let mediaRecorder;
let audioChunks = [];
let captureStream = null;
let activeStreams = [];

function updateActiveTab(activeTab) {
    [tabMom, tabActionItems, tabEmailDraft, tabAnalytics, tabTranscript, tabInsights].forEach(tab => {
        if (tab === activeTab) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

const defaultMomPrompt = `Provide a thorough and impressive summary of this meeting. Create the format for your report in Markdown that best fits this type of meeting.`;

tabMom.addEventListener('click', () => {
    updateActiveTab(tabMom);
    if (!currentMom) {
        resultsContent.innerHTML = "<em>No MOM generated.</em>";
        return;
    }
    const rawHtml = marked.parse(currentMom);
    resultsContent.innerHTML = `
        <div style="margin-bottom: 20px; background: rgba(0,0,0,0.1); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
            <label style="display:block; font-size: 0.9rem; margin-bottom: 8px; color: var(--text-main); font-weight: bold;">Custom MOM Prompt</label>
            <textarea id="customMomPrompt" style="width: 100%; height: 120px; padding: 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text-main); font-size: 0.85rem; resize: vertical; line-height: 1.4;">${defaultMomPrompt}</textarea>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                <button id="regenerateMomBtn" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: bold;">
                    🔄 Regenerate Summary
                </button>
                <button id="copyMomBtn" style="background: var(--primary); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: bold;">
                    📋 Copy to Clipboard
                </button>
            </div>
        </div>
        <div id="momMarkdownContainer">${DOMPurify.sanitize(rawHtml)}</div>
    `;
    
    document.getElementById('regenerateMomBtn').addEventListener('click', async () => {
        const customPrompt = document.getElementById('customMomPrompt').value;
        const btn = document.getElementById('regenerateMomBtn');
        btn.textContent = "🔄 Regenerating...";
        btn.disabled = true;
        
        document.getElementById('momMarkdownContainer').innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 0; color: var(--text-muted);">
                <i data-lucide="loader" class="spin-icon" style="width: 32px; height: 32px; color: #10b981; margin-bottom: 1rem;"></i>
                <p>Regenerating summary with custom prompt...</p>
            </div>
        `;
        lucide.createIcons();

        try {
            const response = await fetch('/api/regenerate_mom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript_text: currentTranscript,
                    model: 'gemini-3.1-pro-preview',
                    api_key: document.getElementById('apiKeyInput').value.trim(),
                    meeting_name: currentMeetingName,
                    custom_prompt: customPrompt
                })
            });
            const data = await response.json();
            if (data.mom) {
                currentMom = data.mom;
                document.getElementById('momMarkdownContainer').innerHTML = DOMPurify.sanitize(marked.parse(currentMom));
                saveState();
            } else {
                alert(data.error || "Error regenerating MOM");
            }
        } catch(err) {
            alert("Failed to connect to server.");
        } finally {
            btn.textContent = "🔄 Regenerate Summary";
            btn.disabled = false;
        }
    });

    document.getElementById('copyMomBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(currentMom).then(() => {
            const btn = document.getElementById('copyMomBtn');
            btn.textContent = "✅ Copied!";
            setTimeout(() => btn.textContent = "📋 Copy to Clipboard", 2000);
        });
    });
});

tabActionItems.addEventListener('click', () => {
    updateActiveTab(tabActionItems);
    renderResult(currentActionItems);
});

tabEmailDraft.addEventListener('click', () => {
    updateActiveTab(tabEmailDraft);
    if (!currentEmailDraft) {
        resultsContent.innerHTML = "<em>No email draft generated.</em>";
        return;
    }
    // Add a copy button for the email
    const rawHtml = marked.parse(currentEmailDraft);
    resultsContent.innerHTML = `
        <div style="margin-bottom: 15px; text-align: right;">
            <button id="copyEmailBtn" style="background: var(--primary); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">
                📋 Copy to Clipboard
            </button>
        </div>
        <div>${DOMPurify.sanitize(rawHtml)}</div>
    `;
    
    document.getElementById('copyEmailBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(currentEmailDraft).then(() => {
            const btn = document.getElementById('copyEmailBtn');
            btn.textContent = "✅ Copied!";
            setTimeout(() => btn.textContent = "📋 Copy to Clipboard", 2000);
        });
    });
});

tabAnalytics.addEventListener('click', () => {
    updateActiveTab(tabAnalytics);
    if (!currentTranscript || currentTranscript.length < 10) {
        resultsContent.innerHTML = "<em>No meeting data available for analytics yet.</em>";
        return;
    }

    // 1. Calculate Total Words
    const totalWords = currentTranscript.split(/\s+/).filter(w => w.length > 0).length;

    // 2. Calculate Meeting Duration (Estimate from chunks: 15s per chunk)
    // If chunkCount is 0 (e.g. pasted transcript), estimate based on 150 words per minute
    const durationMinutes = chunkCount > 0 ? (chunkCount * 15) / 60 : Math.max(1, totalWords / 150);
    const wpm = Math.round(totalWords / durationMinutes);

    // 3. Question Density
    const questions = (currentTranscript.match(/\?/g) || []).length;

    // 4. Interaction Style (Turns)
    const speakerMatches = [...currentTranscript.matchAll(/\*\*([^*]+):\*\*/g)];
    const totalTurns = speakerMatches.length;
    
    let interactionStyle = "Balanced";
    if (totalTurns > 0) {
        const wordsPerTurn = totalWords / totalTurns;
        if (wordsPerTurn > 80) interactionStyle = "Presentation / Monologue";
        else if (wordsPerTurn < 25) interactionStyle = "Highly Interactive / Brainstorming";
    } else {
        interactionStyle = "Unknown (No speaker changes detected)";
    }

    // 5. Render Dashboard
    resultsContent.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                <div style="background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border); text-align: center;">
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; color: var(--text-muted);">Total Words Spoken</h3>
                    <div style="font-size: 2.5rem; font-weight: bold; color: var(--primary);">${totalWords}</div>
                </div>
                
                <div style="background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border); text-align: center;">
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; color: var(--text-muted);">Meeting Pace</h3>
                    <div style="font-size: 2.5rem; font-weight: bold; color: #f59e0b;">${wpm} <span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">WPM</span></div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                <div style="background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border); text-align: center;">
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; color: var(--text-muted);">Questions Asked</h3>
                    <div style="font-size: 2.5rem; font-weight: bold; color: #10b981;">${questions}</div>
                </div>
                
                <div style="background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border); text-align: center;">
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; color: var(--text-muted);">Interaction Style</h3>
                    <div style="font-size: 1.5rem; font-weight: bold; color: #8b5cf6; display: flex; align-items: center; justify-content: center; height: 100%; margin-top: -10px;">${interactionStyle}</div>
                </div>
            </div>
            
        </div>
    `;
});

tabTranscript.addEventListener('click', () => {
    updateActiveTab(tabTranscript);
    renderResult(currentTranscript);
});

tabInsights.addEventListener('click', () => {
    updateActiveTab(tabInsights);
    const descriptionHtml = `
        <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
            <h3 style="margin-top: 0; color: var(--primary);">What to Ask Next (Gemini) History</h3>
            <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.5; margin: 0;">
                During the meeting, Gemini actively listened to the conversation and generated these smart, contextual follow-up questions in real-time to help clarify ambiguities and drive the discussion forward.
            </p>
        </div>
    `;
    if (currentInsightsHtml) {
        resultsContent.innerHTML = descriptionHtml + currentInsightsHtml;
    } else {
        resultsContent.innerHTML = descriptionHtml + "<em>No 'What to Ask Next' prompts were generated during this meeting.</em>";
    }
});

function renderResult(text) {
    if (!text) return;
    const rawHtml = marked.parse(text);
    resultsContent.innerHTML = DOMPurify.sanitize(rawHtml);
}

function showApiError(msg) {
        const errEl = document.getElementById('apiKeyError');
        if (errEl) {
            errEl.textContent = `API Error: ${msg}`;
            errEl.style.display = 'block';
            
            // If the error is likely due to the API key being invalid
            if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('400')) {
                // We can optionally stop recording here if needed
            }
        }
    }

    function clearApiError() {
        const errEl = document.getElementById('apiKeyError');
        if (errEl) errEl.style.display = 'none';
    }

    async function fetchLiveInsights(apiKey) {
        if (!currentTranscript) return;
        liveInsightsSection.style.display = 'block';
        liveInsightStatus.innerHTML = '<div class="dot" style="width: 6px; height: 6px; background-color: #fbbf24;"></div> <em>Thinking...</em>';
        liveInsightStatus.style.color = '#fbbf24';
        
        const pendingQuestions = Array.from(liveInsightList.children)
            .map(div => {
                const checkbox = div.querySelector('input[type="checkbox"]');
                const span = div.querySelector('span');
                if (checkbox && !checkbox.checked && span) {
                    return { text: span.innerText.replace('Suggested: ', '').trim(), div: div, checkbox: checkbox };
                }
                return null;
            })
            .filter(q => q !== null);

        const pendingTextList = pendingQuestions.map(q => q.text);
        
        // Collect ALL questions to avoid duplicates
        const allQuestionsList = Array.from(liveInsightList.children)
            .map(div => {
                const span = div.querySelector('span');
                if (span) {
                    return span.innerText.replace('Suggested: ', '').trim();
                }
                return null;
            })
            .filter(q => q !== null);

        const insightsModel = 'gemini-3.1-pro-preview';

        try {
            const response = await fetch('/api/suggest_questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: currentTranscript,
                    silence_count: consecutiveSilences,
                    pending_questions: pendingTextList,
                    asked_questions: allQuestionsList,
                    model: insightsModel,
                    api_key: apiKey
                })
            });
            const data = await response.json();
            
            if (data.error) {
                showApiError(data.error);
                return;
            }
        
        liveInsightStatus.innerHTML = '<div class="dot" style="width: 6px; height: 6px; background-color: #a1a1aa;"></div> <em>Listening...</em>';
        liveInsightStatus.style.color = '#a1a1aa';
        
        if (data.answered_questions && data.answered_questions.length > 0) {
            data.answered_questions.forEach(ansObj => {
                const qText = ansObj.question || ansObj; // Fallback just in case Gemini returns a string
                const aText = ansObj.answer || "Answered in the meeting.";
                const match = pendingQuestions.find(q => q.text.includes(qText) || (typeof qText === 'string' && qText.includes(q.text)));
                if (match && !match.checkbox.checked) {
                    match.checkbox.checked = true;
                    match.checkbox.dispatchEvent(new Event('change'));
                    
                    const contentDiv = match.div.children[1];
                    if (contentDiv && !contentDiv.querySelector('.auto-answer')) {
                        const answerDiv = document.createElement('div');
                        answerDiv.className = 'auto-answer';
                        answerDiv.style.fontSize = '0.85rem';
                        answerDiv.style.color = '#10b981'; // emerald-500
                        answerDiv.style.background = 'rgba(16, 185, 129, 0.1)';
                        answerDiv.style.padding = '0.25rem 0.5rem';
                        answerDiv.style.borderRadius = '4px';
                        answerDiv.style.marginTop = '0.25rem';
                        answerDiv.innerHTML = `<strong>Answer:</strong> ${aText}`;
                        contentDiv.appendChild(answerDiv);
                    }
                }
            });
        }
        
        if (data.suggestion && data.suggestion !== '[NONE]') {
            const questionDiv = document.createElement('div');
            questionDiv.style.display = 'flex';
            questionDiv.style.alignItems = 'flex-start';
            questionDiv.style.gap = '0.5rem';
            questionDiv.style.padding = '0.5rem';
            questionDiv.style.background = 'rgba(0,0,0,0.2)';
            questionDiv.style.borderRadius = '4px';
            questionDiv.style.borderLeft = '3px solid #818cf8';
            questionDiv.style.flexShrink = '0';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.marginTop = '0.25rem';
            checkbox.style.cursor = 'pointer';
            
            const textSpan = document.createElement('span');
            textSpan.style.color = '#e2e8f0';
            textSpan.style.fontSize = '0.95rem';
            textSpan.innerHTML = `<strong>Suggested:</strong> ${data.suggestion}`;
            
            checkbox.addEventListener('change', (e) => {
                if(e.target.checked) {
                    textSpan.style.textDecoration = 'line-through';
                    textSpan.style.color = '#64748b';
                    questionDiv.style.borderLeftColor = '#64748b';
                } else {
                    textSpan.style.textDecoration = 'none';
                    textSpan.style.color = '#e2e8f0';
                    questionDiv.style.borderLeftColor = '#818cf8';
                }
            });
            
            const contentDiv = document.createElement('div');
            contentDiv.style.display = 'flex';
            contentDiv.style.flexDirection = 'column';
            contentDiv.appendChild(textSpan);
            
            questionDiv.appendChild(checkbox);
            questionDiv.appendChild(contentDiv);
            
            liveInsightList.prepend(questionDiv);
            
            if (consecutiveSilences >= 2) consecutiveSilences = 0;
        }
    } catch (e) {
        console.error("Failed to fetch insights:", e);
        liveInsightStatus.innerHTML = '<div class="dot" style="width: 6px; height: 6px; background-color: #ef4444;"></div> <em>Error</em>';
        liveInsightStatus.style.color = '#ef4444';
    }
}

startBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    
    if (!key) {
        showApiError('Please provide a Gemini API Key first.');
        return;
    }

    try {
        activeStreams = [];
        let streams = [];
        
        const captureMicAudio = cardMicOnly.classList.contains('active') || cardTabAudio.classList.contains('active');
        const captureSysAudio = cardTabAudio.classList.contains('active') || cardMeetingOnly.classList.contains('active');
        
        if (!captureMicAudio && !captureSysAudio) {
            alert('Please select at least one audio source (Microphone or Meeting Audio).');
            return;
        }

        // 1. Get Microphone if checked
        if (captureMicAudio) {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streams.push(micStream);
            activeStreams.push(micStream);
        }

        // 2. Get Display Media if checked
        if (captureSysAudio) {
            try {
                const displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { displaySurface: "browser" },
                    audio: true
                });
                
                if (displayStream.getVideoTracks().length > 0) {
                    const label = displayStream.getVideoTracks()[0].label || "";
                    // If the label is a generic system name, ignore it
                    if (!label.startsWith("screen") && !label.startsWith("window") && !label.includes("web-contents")) {
                        currentMeetingName = label;
                    }
                }
                
                // Override with manual input if provided
                const manualName = document.getElementById('meetingNameInput').value.trim();
                if (manualName) {
                    currentMeetingName = manualName;
                }
                
                if (displayStream.getAudioTracks().length > 0) {
                    streams.push(displayStream);
                    activeStreams.push(displayStream);
                } else {
                    console.warn("User didn't share tab audio.");
                }
                
                // Stop video tracks immediately
                displayStream.getVideoTracks().forEach(track => track.stop());
            } catch(e) {
                console.warn("Display media cancelled.", e);
            }
        }

        // 3. Merge streams using Web Audio API
        if (streams.length === 0) {
            throw new Error("No audio sources were selected or permissions were denied.");
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioContext.createMediaStreamDestination();
        
        streams.forEach(stream => {
            if (stream.getAudioTracks().length > 0) {
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(dest);
            }
        });
        
        captureStream = dest.stream;

        // --- SILENCE DETECTION SETUP ---
        const silenceAnalyser = audioContext.createAnalyser();
        silenceAnalyser.fftSize = 256;
        const silenceSource = audioContext.createMediaStreamSource(captureStream);
        silenceSource.connect(silenceAnalyser);
        const silenceDataArray = new Uint8Array(silenceAnalyser.frequencyBinCount);
        // -------------------------------
        
        mediaRecorder = new MediaRecorder(captureStream, { mimeType: 'audio/webm' });
        audioChunks = [];
        consecutiveSilences = 0;
        chunkCount = 0;
        liveInsightList.innerHTML = '';
        liveInsightStatus.innerHTML = '<div class="dot" style="width: 6px; height: 6px; background-color: #a1a1aa;"></div> <em>Listening...</em>';
        liveInsightStatus.style.color = '#a1a1aa';

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = processAudio;
        mediaRecorder.start();

        // Silence detection loop state
        let isRecordingChunk = false;
        let maxVolumeInChunk = 0;

        const checkAudioLevel = () => {
            if (!isRecordingChunk) return;
            silenceAnalyser.getByteFrequencyData(silenceDataArray);
            let sum = 0;
            for(let i = 0; i < silenceDataArray.length; i++) {
                sum += silenceDataArray[i];
            }
            let avg = sum / silenceDataArray.length;
            if (avg > maxVolumeInChunk) maxVolumeInChunk = avg;
            requestAnimationFrame(checkAudioLevel);
        };

        // Start independent chunk recorder loop to guarantee valid WebM files
        const startChunkRecorder = () => {
            if (mediaRecorder.state === 'inactive') return;
            
            let chunkRecorder = new MediaRecorder(captureStream, { mimeType: 'audio/webm' });
            let localChunks = [];
            
            chunkRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) localChunks.push(e.data);
            };
            
            chunkRecorder.onstart = () => {
                maxVolumeInChunk = 0;
                isRecordingChunk = true;
                checkAudioLevel();
            };

            chunkRecorder.onstop = async () => {
                isRecordingChunk = false;
                
                // If the volume during this 15s chunk was practically zero, skip hitting the API
                // This completely eliminates AI hallucinations caused by whispering to silence.
                if (maxVolumeInChunk < 2.0) {
                    console.log("Chunk was completely silent (max volume: " + maxVolumeInChunk.toFixed(2) + "). Skipping API call to prevent hallucination.");
                    consecutiveSilences++;
                    
                    // Add to the main transcript so it shows up in the final exported file
                    currentTranscript += (currentTranscript ? "\\n\\n" : "") + "[Silence]";

                    if (liveTranscriptContent.innerHTML.includes('<em>Listening...</em>')) {
                        liveTranscriptContent.innerHTML = '';
                    }
                    liveTranscriptContent.innerHTML += "<br/><em>[Silence]</em>";
                    liveTranscriptSection.scrollTop = liveTranscriptSection.scrollHeight;
                    
                    return;
                }

                if (localChunks.length === 0) return;
                const chunkBlob = new Blob(localChunks, { type: 'audio/webm' });
                try {
                    const base64Chunk = await blobToBase64(chunkBlob);
                    const base64Data = base64Chunk.split(',')[1];
                    const apiKey = apiKeyInput.value.trim();
                    if (!apiKey) return;
                    
                    const response = await fetch('/api/transcribe_chunk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            audio_base64: base64Data,
                            mime_type: chunkBlob.type || 'audio/webm',
                            model: 'gemini-3.5-flash',
                            api_key: apiKey,
                            history: currentTranscript
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.error) {
                        showApiError(data.error);
                        return;
                    }
                    
                    clearApiError();
                    chunkCount++;
                    
                    if (data.transcript && data.transcript.includes('[SILENCE]')) {
                        consecutiveSilences++;
                    } else if (data.transcript) {
                        const newText = data.transcript.trim();
                        // Anti-hallucination check: if the AI just repeats a large chunk of what is already 
                        // in the recent transcript (due to silence confusion), ignore it completely.
                        if (newText.length > 30 && currentTranscript.includes(newText)) {
                            console.warn("Ignored chunk: Detected AI history hallucination/echo during silence.");
                            return;
                        }

                        consecutiveSilences = 0;
                        currentTranscript += (currentTranscript ? "\n\n" : "") + newText;
                        
                        if (liveTranscriptContent.innerHTML.includes('<em>Listening...</em>')) {
                            liveTranscriptContent.innerHTML = '';
                        }
                        
                        const p = document.createElement('p');
                        p.textContent = newText;
                        liveTranscriptContent.appendChild(p);
                        liveTranscriptSection.scrollTop = liveTranscriptSection.scrollHeight;
                        
                        saveState();
                    }
                    
                    if (consecutiveSilences === 2 || (chunkCount % 3 === 0 && currentTranscript.length > 50)) {
                        fetchLiveInsights(apiKey);
                    }
                } catch (e) {
                    console.error("Chunk transcription error:", e);
                }
            };
            
            chunkRecorder.start();
            
            // Stop after 15s to process the valid file, then loop
            setTimeout(() => {
                if (chunkRecorder.state === 'recording') {
                    chunkRecorder.stop();
                    startChunkRecorder();
                }
            }, 15000);
        };
        
        startChunkRecorder();
        
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        startBtn.style.cursor = 'not-allowed';
        stopBtn.disabled = false;
        recordingIndicator.classList.add('active');
        liveTranscriptSection.style.display = 'block';
        liveInsightsSection.style.display = 'block';
        liveTranscriptContent.innerHTML = '<em>Listening...</em>';
        resultsSection.style.display = 'none';
        document.querySelector('.app-container').classList.remove('expanded');
        resultsContent.innerHTML = '';
        
        startTime = Date.now();
        recordingTimer.textContent = '00:00';
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const s = (elapsed % 60).toString().padStart(2, '0');
            recordingTimer.textContent = `${m}:${s}`;
        }, 1000);
        
    } catch (err) {
        console.error("Error starting recording:", err);
        alert('Could not start recording. Did you grant permission?');
        validateStartButton();
    }
});

stopBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    stopTracks();
    
    // Update UI to show meeting has ended while processing summary
    const transcriptStatus = document.createElement('div');
    transcriptStatus.style.marginTop = '10px';
    transcriptStatus.innerHTML = '<em style="color: var(--primary);">[Recording Ended - Generating Summary...]</em>';
    document.getElementById('liveTranscriptContent').appendChild(transcriptStatus);
    
    document.getElementById('liveInsightStatus').innerHTML = '<div class="dot" style="width: 6px; height: 6px; background-color: var(--primary); animation: none; opacity: 0.5;"></div> <em>Ended</em>';
});

function stopTracks() {
    if (activeStreams) {
        activeStreams.forEach(s => s.getTracks().forEach(t => t.stop()));
        activeStreams = [];
    }
    if (captureStream) {
        captureStream.getTracks().forEach(track => track.stop());
    }
    // We do NOT re-enable startBtn here because processAudio() is running.
    stopBtn.disabled = true;
    recordingIndicator.classList.remove('active');
    
    if (timerInterval) {
        clearInterval(timerInterval);
    }
}

async function processAudio() {
    loadingSpinner.classList.add('active');

    try {
        // Send transcript text instead of base64 audio to speed up processing
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            alert("Please enter your Gemini API key in the input box.");
            validateStartButton();
            stopBtn.disabled = true;
            loadingSpinner.classList.remove('active');
            return;
        }

        const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transcript_text: currentTranscript,
                model: 'gemini-3.1-pro-preview',
                api_key: apiKey,
                meeting_name: currentMeetingName
            })
        });

        const data = await response.json();
        
        if (data.error) {
            showApiError(data.error);
            alert("Error summarizing meeting: " + data.error);
            loadingIndicator.style.display = 'none';
            return;
        }
        
        clearApiError();
        
        if (!response.ok) {
            throw new Error(data.error || 'Unknown backend error');
        }

        currentMom = data.mom || "*No MOM generated.*";
        currentActionItems = data.action_items || "*No action items generated.*";
        currentEmailDraft = data.email_draft || "*No email draft generated.*";
        currentTranscript = data.transcript || "*No transcript generated.*";
        currentInsightsHtml = liveInsightList.innerHTML;
        
        saveState();
        


        // Expand the UI to full width to make reading easier
        document.querySelector('.app-container').classList.add('expanded');

        // Render the MOM tab by default
        tabMom.click();
        resultsSection.style.display = 'flex';
        liveTranscriptSection.style.display = 'none';
        liveInsightsSection.style.display = 'none';
        
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        newBtn.style.display = 'flex';

    } catch (err) {
        console.error("Error processing with Gemini:", err);
        
        // Fallback or error display (safely injected using textContent for raw errors)
        const errorMsg = document.createElement('div');
        errorMsg.style.color = 'var(--danger)';
        errorMsg.textContent = 'Error generating MOM. Please check your API key and try again. Detailed error: ' + err.message;
        resultsContent.replaceChildren(errorMsg);
        resultsSection.style.display = 'flex';
        liveTranscriptSection.style.display = 'none';
        liveInsightsSection.style.display = 'none';
        validateStartButton();
    } finally {
        loadingSpinner.classList.remove('active');
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// --- Chat functionality ---
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatHistory = document.getElementById('chatHistory');

async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    // Add user message to UI
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user-msg';
    userDiv.textContent = text;
    chatHistory.appendChild(userDiv);
    chatInput.value = '';
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    // Add loading AI msg
    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-msg ai-msg';
    aiDiv.innerHTML = '<em>Thinking...</em>';
    chatHistory.appendChild(aiDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    try {
        const insightsText = Array.from(document.getElementById('liveInsightList').children)
            .map(div => div.textContent.trim())
            .join('\n');
            
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKeyInput.value.trim(),
                model: 'gemini-3.1-pro-preview',
                transcript: currentTranscript,
                mom: currentMom,
                action_items: currentActionItems,
                insights: insightsText,
                question: text
            })
        });
        const data = await response.json();
        
        if (data.error) {
            aiDiv.textContent = "Error: " + data.error;
        } else {
            aiDiv.innerHTML = DOMPurify.sanitize(marked.parse(data.answer));
            saveState();
        }
    } catch (err) {
        aiDiv.textContent = "Failed to connect to server.";
    }
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

// Warn the user if they try to close or refresh the page while recording is active
window.addEventListener('beforeunload', (e) => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        e.preventDefault();
        // Modern browsers ignore this custom text and show a static message, but we still set it.
        e.returnValue = 'your meeting will be lost.';
    }
});

// --- Session State Management ---
function saveState() {
    sessionStorage.setItem('savedMom', currentMom);
    sessionStorage.setItem('savedActionItems', currentActionItems);
    sessionStorage.setItem('savedTranscript', currentTranscript);
    sessionStorage.setItem('savedInsights', currentInsightsHtml);
    sessionStorage.setItem('savedChat', chatHistory.innerHTML);
}

newBtn.addEventListener('click', () => {
    sessionStorage.removeItem('savedMom');
    sessionStorage.removeItem('savedActionItems');
    sessionStorage.removeItem('savedTranscript');
    sessionStorage.removeItem('savedInsights');
    sessionStorage.removeItem('savedChat');
    
    currentMom = "";
    currentActionItems = "";
    currentTranscript = "";
    currentInsightsHtml = "";
    chatHistory.innerHTML = '<div class="chat-msg ai-msg">Hi! Ask me anything about this meeting transcript.</div>';
    
    document.querySelector('.app-container').classList.remove('expanded');
    resultsSection.style.display = 'none';
    resultsContent.innerHTML = '';
    
    startBtn.style.display = 'flex';
    startBtn.disabled = false;
    stopBtn.style.display = 'flex';
    stopBtn.disabled = true;
    newBtn.style.display = 'none';
});

// Restore state on load
window.addEventListener('DOMContentLoaded', () => {
    const savedMom = sessionStorage.getItem('savedMom');
    if (savedMom) {
        currentMom = savedMom;
        currentActionItems = sessionStorage.getItem('savedActionItems') || '';
        currentTranscript = sessionStorage.getItem('savedTranscript') || '';
        currentInsightsHtml = sessionStorage.getItem('savedInsights') || '';
        const savedChat = sessionStorage.getItem('savedChat');
        if (savedChat) {
            chatHistory.innerHTML = savedChat;
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
        
        document.querySelector('.app-container').classList.add('expanded');
        resultsSection.style.display = 'flex';
        tabMom.click();
        
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        newBtn.style.display = 'flex';
    }


});

// --- PDF Export Logic ---
exportPdfBtn.addEventListener('click', () => {
    exportModal.style.display = 'flex';
});

cancelExportBtn.addEventListener('click', () => {
    exportModal.style.display = 'none';
});

confirmExportBtn.addEventListener('click', () => {
    exportModal.style.display = 'none';
    
    // Create a temporary container for the PDF content
    const pdfContainer = document.createElement('div');
    pdfContainer.style.padding = '20px';
    pdfContainer.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    
    // Helper to add a section
    const addSection = (title, markdownOrHtml, isHtml=false) => {
        const titleEl = document.createElement('h2');
        titleEl.textContent = title;
        titleEl.style.color = '#333';
        titleEl.style.borderBottom = '2px solid #e2e8f0';
        titleEl.style.paddingBottom = '8px';
        titleEl.style.marginTop = '24px';
        pdfContainer.appendChild(titleEl);
        
        const contentEl = document.createElement('div');
        contentEl.style.fontSize = '14px';
        contentEl.style.lineHeight = '1.6';
        contentEl.style.color = '#1e293b';
        
        if (isHtml) {
            contentEl.innerHTML = markdownOrHtml;
        } else {
            contentEl.innerHTML = marked.parse(markdownOrHtml);
        }
        
        pdfContainer.appendChild(contentEl);
    };

    if (document.getElementById('exportCheckMom').checked && currentMom) {
        addSection('MOM Summary', currentMom);
    }
    
    if (document.getElementById('exportCheckEmailDraft').checked && currentEmailDraft) {
        addSection('Follow-Up Email Draft', currentEmailDraft);
    }
    
    if (document.getElementById('exportCheckActionItems').checked && currentActionItems) {
        addSection('Action Items', currentActionItems);
    }
    
    if (document.getElementById('exportCheckTranscript').checked && currentTranscript) {
        addSection('Full Transcript', currentTranscript);
    }
    
    if (document.getElementById('exportCheckInsights').checked && currentInsightsHtml) {
        // Strip out checkboxes for PDF since they don't render well
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = currentInsightsHtml;
        tempDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.remove());
        addSection('What to Ask Next (Gemini) History', tempDiv.innerHTML, true);
    }

    if (pdfContainer.childNodes.length === 0) {
        alert('Please select at least one section to export.');
        return;
    }

    const originalText = confirmExportBtn.textContent;
    confirmExportBtn.textContent = 'Generating...';
    confirmExportBtn.disabled = true;

    // Use a hidden iframe for native browser printing 
    // This bypasses the HTML5 Canvas 16,384px height limit that truncates long transcripts
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write('<html><head><title>Meeting Summary</title>');
    doc.write('<style>');
    doc.write('body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; line-height: 1.6; color: #1e293b; }');
    doc.write('h2 { color: #333; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 24px; page-break-after: avoid; }');
    doc.write('table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }');
    doc.write('th, td { border: 1px solid #e2e8f0; padding: 0.75rem; text-align: left; }');
    doc.write('th { background-color: #f8fafc; }');
    doc.write('p, li { page-break-inside: avoid; }'); // prevent splitting lines across pages
    doc.write('</style>');
    doc.write('</head><body>');
    doc.write(pdfContainer.innerHTML);
    doc.write('</body></html>');
    doc.close();

    // Small delay to ensure styles and content are fully loaded into the iframe
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        document.body.removeChild(iframe);
        
        confirmExportBtn.textContent = originalText;
        confirmExportBtn.disabled = false;
    }, 500);
});

// --- History Logic ---
const historyBtn = document.getElementById('historyBtn');
const historyModal = document.getElementById('historyModal');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyList = document.getElementById('historyList');
const historySearchInput = document.getElementById('historySearchInput');

let allHistoryMeetings = [];

function renderHistory(data) {
    if (data.length === 0) {
        historyList.innerHTML = '<div style="text-align: center; color: #64748b; padding: 20px;">No past meetings found.</div>';
        return;
    }
    
    historyList.innerHTML = '';
    data.forEach(meeting => {
        const item = document.createElement('div');
        item.style.padding = '16px';
        item.style.border = '1px solid #e2e8f0';
        item.style.borderRadius = '8px';
        item.style.cursor = 'pointer';
        item.style.transition = 'all 0.2s';
        item.onmouseover = () => { item.style.borderColor = '#6366f1'; item.style.backgroundColor = '#f8fafc'; };
        item.onmouseout = () => { item.style.borderColor = '#e2e8f0'; item.style.backgroundColor = 'white'; };
        
        const title = document.createElement('div');
        title.style.fontWeight = '600';
        title.style.color = '#1e293b';
        title.style.marginBottom = '4px';
        title.textContent = meeting.title;
        
        const date = document.createElement('div');
        date.style.fontSize = '0.85rem';
        date.style.color = '#64748b';
        date.textContent = new Date(meeting.created_at).toLocaleString();
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width:14px; height:14px;"></i>';
        deleteBtn.style.position = 'absolute';
        deleteBtn.style.right = '16px';
        deleteBtn.style.top = '16px';
        deleteBtn.style.background = 'none';
        deleteBtn.style.border = 'none';
        deleteBtn.style.color = '#ef4444';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.padding = '4px';
        deleteBtn.style.borderRadius = '4px';
        deleteBtn.title = 'Delete Meeting';
        deleteBtn.onmouseover = (e) => { deleteBtn.style.background = '#fef2f2'; e.stopPropagation(); };
        deleteBtn.onmouseout = (e) => { deleteBtn.style.background = 'none'; e.stopPropagation(); };
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if(confirm('Delete this meeting from history?')) {
                fetch('/api/history/' + meeting.id, {method: 'DELETE'})
                    .then(() => loadHistory());
            }
        };
        
        const editBtn = document.createElement('button');
        editBtn.innerHTML = '<i data-lucide="pencil" style="width:14px; height:14px;"></i>';
        editBtn.style.position = 'absolute';
        editBtn.style.right = '46px';
        editBtn.style.top = '16px';
        editBtn.style.background = 'none';
        editBtn.style.border = 'none';
        editBtn.style.color = '#64748b';
        editBtn.style.cursor = 'pointer';
        editBtn.style.padding = '4px';
        editBtn.style.borderRadius = '4px';
        editBtn.title = 'Rename Meeting';
        editBtn.onmouseover = (e) => { editBtn.style.background = '#f1f5f9'; e.stopPropagation(); };
        editBtn.onmouseout = (e) => { editBtn.style.background = 'none'; e.stopPropagation(); };
        editBtn.onclick = (e) => {
            e.stopPropagation();
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = meeting.title;
            input.style.width = '70%';
            input.style.padding = '4px 8px';
            input.style.border = '1px solid #6366f1';
            input.style.borderRadius = '4px';
            input.style.outline = 'none';
            input.style.fontWeight = '600';
            input.style.color = '#1e293b';
            input.style.marginBottom = '4px';
            
            editBtn.style.display = 'none';
            deleteBtn.style.display = 'none';
            title.style.display = 'none';
            
            const saveBtn = document.createElement('button');
            saveBtn.innerHTML = '<i data-lucide="check" style="width:14px; height:14px;"></i>';
            saveBtn.style.position = 'absolute';
            saveBtn.style.right = '46px';
            saveBtn.style.top = '16px';
            saveBtn.style.background = '#22c55e';
            saveBtn.style.border = 'none';
            saveBtn.style.color = 'white';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.padding = '4px';
            saveBtn.style.borderRadius = '4px';
            saveBtn.title = 'Save';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.innerHTML = '<i data-lucide="x" style="width:14px; height:14px;"></i>';
            cancelBtn.style.position = 'absolute';
            cancelBtn.style.right = '16px';
            cancelBtn.style.top = '16px';
            cancelBtn.style.background = '#ef4444';
            cancelBtn.style.border = 'none';
            cancelBtn.style.color = 'white';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.style.padding = '4px';
            cancelBtn.style.borderRadius = '4px';
            cancelBtn.title = 'Cancel';
            
            const cleanup = () => {
                input.remove();
                saveBtn.remove();
                cancelBtn.remove();
                title.style.display = 'block';
                editBtn.style.display = 'block';
                deleteBtn.style.display = 'block';
            };
            
            cancelBtn.onclick = (ev) => {
                ev.stopPropagation();
                cleanup();
            };
            
            const saveName = (ev) => {
                ev.stopPropagation();
                const newName = input.value.trim();
                if (newName && newName !== meeting.title) {
                    fetch('/api/history/' + meeting.id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({title: newName})
                    }).then(() => loadHistory());
                } else {
                    cleanup();
                }
            };
            
            saveBtn.onclick = saveName;
            input.onkeydown = (ev) => {
                if (ev.key === 'Enter') saveName(ev);
                if (ev.key === 'Escape') cancelBtn.onclick(ev);
            };
            input.onclick = (ev) => ev.stopPropagation();
            
            item.insertBefore(input, date);
            item.appendChild(saveBtn);
            item.appendChild(cancelBtn);
            lucide.createIcons();
            input.focus();
        };
        
        item.style.position = 'relative';
        item.appendChild(title);
        item.appendChild(date);
        item.appendChild(editBtn);
        item.appendChild(deleteBtn);
        
        item.addEventListener('click', () => {
            loadMeetingDetails(meeting.id);
        });
        
        historyList.appendChild(item);
    });
    lucide.createIcons();
}

if (historySearchInput) {
    historySearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allHistoryMeetings.filter(m => 
            m.title.toLowerCase().includes(query) || 
            new Date(m.created_at).toLocaleString().toLowerCase().includes(query)
        );
        renderHistory(filtered);
    });
}


function loadHistory() {
    historyList.innerHTML = '<div style="text-align: center; color: #64748b; padding: 20px;">Loading history...</div>';
    fetch('/api/history')
        .then(res => res.json())
        .then(data => {
            allHistoryMeetings = data;
            renderHistory(data);
            if (historySearchInput) {
                historySearchInput.value = '';
            }
        })
        .catch(err => {
            console.error("Failed to load history", err);
            historyList.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">Failed to load history.</div>';
        });
}

function loadMeetingDetails(id) {
    historyModal.style.display = 'none';
    fetch('/api/history/' + id)
        .then(res => res.json())
        .then(data => {
            if(data.error) {
                alert(data.error);
                return;
            }
            
            currentMom = data.mom || "*No MOM available*";
            currentActionItems = data.action_items || "*No Action Items available*";
            currentTranscript = data.transcript || "*No transcript available*";
            currentInsightsHtml = ""; // Not saved to DB currently
            
            saveState(); // Save to sessionStorage
            
            // Expand UI and show results
            document.querySelector('.app-container').classList.add('expanded');
            resultsSection.style.display = 'flex';
            tabMom.click();
            
            startBtn.style.display = 'none';
            stopBtn.style.display = 'none';
            newBtn.style.display = 'flex';
        })
        .catch(err => {
            console.error(err);
            alert("Error loading meeting details.");
        });
}

if (historyBtn) {
    historyBtn.addEventListener('click', () => {
        historyModal.style.display = 'flex';
        loadHistory();
    });
}

if (closeHistoryBtn) {
    closeHistoryBtn.addEventListener('click', () => {
        historyModal.style.display = 'none';
    });
}

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target === historyModal) {
        historyModal.style.display = 'none';
    }
});
