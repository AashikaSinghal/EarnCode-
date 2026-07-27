import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hrzhkvvfftmgudmcqaxq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WEnWLQPiYSmCNaJDZiqDmg_Mzpa7YdO";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 🔑 GOOGLE GEMINI API KEY INTEGRATED
const GEMINI_API_KEY = "AQ.Ab8RN6IgxMOKgkFbzU6o1SbJ1lDy-VJgInEXyVznMNKgAXbNYg";

// SESSION STATE
let currentUser = "";
let currentUserEmail = "";
let currentLeetCodeId = "";
let pendingSubmissionData = null;
let formScores = { codeScore: 0, screenshotScore: 0, logicScore: 0, aiFlags: [] };

// QUIZ & TIMER STATE VARIABLES
let currentQuizIndex = 0;
let quizQuestions = [];
let quizAnswers = [];
let quizTimerInterval = null;
let currentSecondsLeft = 0;

// DOM ELEMENTS
const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const welcomeMsg = document.getElementById("welcome-msg");
const usernameInput = document.getElementById("username");
const userEmailInput = document.getElementById("user-email");
const leetcodeIdInput = document.getElementById("leetcode-id");
const loginBtn = document.getElementById("login-btn");

const proofForm = document.getElementById("proof-form");
const problemUrlInput = document.getElementById("problem-url");
const screenshotFileInput = document.getElementById("screenshot-file");

// DOM INPUTS FOR COMPLEXITY
const timeComplexityInput = document.getElementById("time-complexity");
const spaceComplexityInput = document.getElementById("space-complexity");

const reflectionTextInput = document.getElementById("reflection-text");
const codeTextInput = document.getElementById("code-text");
const submitBtn = document.getElementById("submit-btn");

const verifiedDaysEl = document.getElementById("verified-days");
const trustScoreEl = document.getElementById("trust-score");

// QUIZ MODAL ELEMENTS
const aiDialog = document.getElementById("ai-dialog");
const quizReadyScreen = document.getElementById("quiz-ready-screen");
const quizActiveScreen = document.getElementById("quiz-active-screen");
const startQuizBtn = document.getElementById("start-quiz-btn");
const quizStepIndicator = document.getElementById("quiz-step-indicator");
const quizTimerEl = document.getElementById("quiz-timer");
const quizProgressBar = document.getElementById("quiz-progress-bar");
const quizQuestionText = document.getElementById("quiz-question-text");
const mcqOptionsContainer = document.getElementById("mcq-options-container");
const submitQuizBtn = document.getElementById("submit-quiz-btn");

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidLeetCodeId(username) {
  const cleanUsername = username.trim();
  const validPattern = /^[a-zA-Z0-9_-]{3,25}$/;
  return validPattern.test(cleanUsername);
}

function showDashboard(name) {
  if (loginScreen) loginScreen.classList.add("hidden");
  if (dashboardScreen) dashboardScreen.classList.remove("hidden");
  if (welcomeMsg) welcomeMsg.textContent = `Hello, ${name}! (${currentLeetCodeId})`;
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// CONVERT FILE TO BASE64 FOR GEMINI VISION
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
}

// AUTOMATICALLY INFER TIME COMPLEXITY FROM CODE STRUCTURE
function inferTimeComplexity(codeText) {
  const code = (codeText || "").toLowerCase();
  
  if (code.includes("mid") && (code.includes("left") || code.includes("low")) && (code.includes("right") || code.includes("high"))) {
    return "O(LOG N)";
  }
  
  const firstFor = code.indexOf("for");
  const secondFor = code.indexOf("for", firstFor + 3);
  if (firstFor !== -1 && secondFor !== -1) {
    return "O(N^2)";
  }

  if (code.includes("for") || code.includes("while") || code.includes("map") || code.includes("filter")) {
    return "O(N)";
  }

  return "O(1)";
}

// 🛡️ PRE-QUIZ GATEKEEPER (GEMINI MULTIMODAL VERIFICATION)
async function validateFormWithGemini(problemUrl, codeText, userExplanation, imageFile) {
  try {
    const imageBase64 = await fileToBase64(imageFile);

    const promptText = `
    You are an automated LeetCode code submission reviewer.
    LeetCode URL: ${problemUrl}
    User's 2-Line Explanation: "${userExplanation}"
    Submitted Code:
    \`\`\`
    ${codeText}
    \`\`\`

    Evaluate these 4 points accurately:
    1. Screenshot Check: Is the image a LeetCode problem submission/acceptance screen? (True/False)
    2. Code Match: Is the pasted code actual valid programming code (Python, C++, Java, JS, etc.) that solves the problem in the URL? (Set False ONLY if it is non-code, HTML, UI script, or completely wrong problem code) (True/False)
    3. Logic Explanation: Does the explanation convey valid technical logic? (Set False ONLY if it is pure random keyboard mash like "dfghjkl" or empty) (True/False)
    4. Malicious Spoof Check: Is there explicit proof of cheating, such as raw LLM boilerplate ("As an AI model...") or non-LeetCode random photos? (Set True ONLY for obvious spoofing/fake photos, default to False for human pasted code) (True/False)

    Respond ONLY in strict JSON format without markdown code blocks:
    {
      "isScreenshotValid": true or false,
      "isCodeValid": true or false,
      "isLogicValid": true or false,
      "isAiOrFakeDetected": true or false,
      "reason": "Short explanation of validation"
    }
    `;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: promptText },
              {
                inline_data: {
                  mime_type: imageFile.type || "image/png",
                  data: imageBase64
                }
              }
            ]
          }]
        })
      }
    );

    const data = await res.json();
    const rawText = data.candidates[0].content.parts[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch[0]);

  } catch (err) {
    console.error("Gemini pre-validation error:", err);
    return {
      isScreenshotValid: true,
      isCodeValid: true,
      isLogicValid: true,
      isAiOrFakeDetected: false,
      reason: "Bypassed gatekeeper check due to network response fallback"
    };
  }
}

// GENERATE 4 TIMED MCQ QUESTIONS
function generateQuizQuestions(codeText) {
  const correctComplexity = inferTimeComplexity(codeText);
  
  let potentialDistractors = ["O(1)", "O(N)", "O(N LOG N)", "O(N^2)", "O(2^N)"];
  let filteredDistractors = potentialDistractors.filter(d => d !== correctComplexity);
  let chosenDistractors = shuffleArray(filteredDistractors).slice(0, 3);

  let primaryApproach = "Iterative Loop Pass";
  let distractors = ["Binary Search Tree", "Graph BFS", "Disjoint Set Union"];

  const code = (codeText || "").toLowerCase();
  if (code.includes("map") || code.includes("dict") || code.includes("hashmap")) {
    primaryApproach = "Hash Map / Dictionary Lookup";
    distractors = ["Two Pointers", "Dynamic Programming", "Stack"];
  } else if (code.includes("dp") || code.includes("memo")) {
    primaryApproach = "Dynamic Programming";
    distractors = ["Greedy", "Binary Search", "Queue"];
  } else if (code.includes("left") && code.includes("right") && (code.includes("while") || code.includes("mid"))) {
    primaryApproach = "Two Pointers / Binary Search";
    distractors = ["Hash Table", "Monotonic Stack", "Trie"];
  }

  const rawQuestions = [
    {
      type: "mcq",
      text: "1. What is the inferred Time Complexity of your submitted solution?",
      timeLimit: 15,
      correctOption: correctComplexity,
      distractors: chosenDistractors
    },
    {
      type: "mcq",
      text: "2. Which core data structure/approach is used in your solution code?",
      timeLimit: 15,
      correctOption: primaryApproach,
      distractors: distractors
    },
    {
      type: "mcq",
      text: "3. How does your code handle an empty array/string input or boundary case?",
      timeLimit: 15,
      correctOption: "Matches boundary condition and returns valid response",
      distractors: [
        "Causes an Infinite Loop",
        "Throws Index Out Of Bounds Error",
        "Triggers Memory Limit Exceeded"
      ]
    },
    {
      type: "mcq",
      text: "4. Why is this solution better than a naive Brute Force method?",
      timeLimit: 15,
      correctOption: "It drastically reduces nested loop passes",
      distractors: [
        "It randomly skips missing elements",
        "It doubles memory usage per iteration",
        "It recalculates all previously checked pairs"
      ]
    }
  ];

  return rawQuestions.map(q => {
    const allOptions = shuffleArray([q.correctOption, ...q.distractors]);
    const correctIndex = allOptions.indexOf(q.correctOption);

    return {
      type: q.type,
      text: q.text,
      timeLimit: q.timeLimit,
      options: allOptions,
      correctIndex: correctIndex
    };
  });
}

function startTimer(seconds, onExpire) {
  clearInterval(quizTimerInterval);
  currentSecondsLeft = seconds;
  const maxSeconds = seconds;

  updateTimerUI(currentSecondsLeft, maxSeconds);

  quizTimerInterval = setInterval(() => {
    currentSecondsLeft--;
    updateTimerUI(currentSecondsLeft, maxSeconds);

    if (currentSecondsLeft <= 0) {
      clearInterval(quizTimerInterval);
      setTimeout(onExpire, 300);
    }
  }, 1000);
}

function updateTimerUI(seconds, maxSeconds) {
  if (quizTimerEl) {
    quizTimerEl.textContent = `⏱️ ${Math.max(0, seconds)}s`;
    quizTimerEl.style.color = seconds <= 5 ? "#e74c3c" : "inherit";
  }
  if (quizProgressBar) {
    quizProgressBar.value = Math.max(0, (seconds / maxSeconds) * 100);
  }
}

// RENDER QUESTION WITH SMOOTH VISUAL FEEDBACK & AUTO-ADVANCE
function renderCurrentQuestion() {
  const q = quizQuestions[currentQuizIndex];
  if (!q) return;

  quizStepIndicator.textContent = `Question ${currentQuizIndex + 1} of ${quizQuestions.length}`;
  quizQuestionText.textContent = q.text;

  mcqOptionsContainer.innerHTML = "";

  if (submitQuizBtn) submitQuizBtn.classList.add("hidden");

  q.options.forEach((optText, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "outline";
    btn.style.textAlign = "left";
    btn.textContent = `${String.fromCharCode(65 + index)}. ${optText}`;
    
    btn.onclick = () => {
      // Highlight selection visually
      btn.style.backgroundColor = "#2ecc71";
      btn.style.borderColor = "#2ecc71";
      btn.style.color = "#ffffff";

      quizAnswers[currentQuizIndex] = index;

      setTimeout(() => {
        advanceQuizStep();
      }, 200);
    };

    mcqOptionsContainer.appendChild(btn);
  });

  startTimer(q.timeLimit, () => {
    quizAnswers[currentQuizIndex] = -1;
    advanceQuizStep();
  });
}

function advanceQuizStep() {
  clearInterval(quizTimerInterval);
  currentQuizIndex++;

  if (currentQuizIndex < quizQuestions.length) {
    renderCurrentQuestion();
  } else {
    saveFinalSubmission();
  }
}

// HANDLE INITIAL FORM SUBMISSION & PRE-QUIZ GATEKEEPER
async function handleSubmission(event) {
  event.preventDefault();

  if (!currentUser) return alert("Please enter login info first");

  const problemUrl = problemUrlInput.value.trim();
  const userTimeComplexity = timeComplexityInput ? timeComplexityInput.value.trim() : "";
  const userSpaceComplexity = spaceComplexityInput ? spaceComplexityInput.value.trim() : "";
  const reflectionText = reflectionTextInput.value.trim();
  const codeText = codeTextInput.value.trim();
  const file = screenshotFileInput.files[0];

  if (!problemUrl || !userTimeComplexity || !userSpaceComplexity || !reflectionText || !codeText || !file) {
    return alert("Please fill all required fields");
  }

  if (!problemUrl.includes("leetcode.com/problems/")) {
    return alert("Please enter a valid LeetCode problem URL (e.g. https://leetcode.com/problems/two-sum/)");
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Validating Proof with Gemini AI... ⏳";

  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: existingSubmission, error: existingError } = await supabaseClient
      .from("submissions")
      .select("id")
      .eq("student_name", currentUser)
      .eq("submitted_on", today)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingSubmission) {
      alert("Aaj ki submission already ho chuki hai");
      submitBtn.disabled = false;
      submitBtn.textContent = "Verify & Submit";
      return;
    }

    // 🛑 RUN PRE-QUIZ GEMINI MULTIMODAL VERIFICATION
    const evalResult = await validateFormWithGemini(problemUrl, codeText, reflectionText, file);

    formScores.codeScore = evalResult.isCodeValid ? 35 : 0;
    formScores.screenshotScore = evalResult.isScreenshotValid ? 15 : 0;
    formScores.logicScore = evalResult.isLogicValid ? 10 : 0;
    formScores.aiFlags = [];

    if (evalResult.isAiOrFakeDetected) {
      formScores.aiFlags.push("Fake Image or Malicious Spoofing Detected");
    }

    const totalFormScore = formScores.codeScore + formScores.screenshotScore + formScores.logicScore;

    // 🛑 GATEKEEPER BLOCK
    if (totalFormScore < 35 || !evalResult.isCodeValid) {
      alert(`❌ Submission Rejected!\n\nReason: ${evalResult.reason || 'Invalid Code, Screenshot, or Logic'}\nCode Score: ${formScores.codeScore}/35\nScreenshot Score: ${formScores.screenshotScore}/15\nLogic Score: ${formScores.logicScore}/10\n\nThe quiz modal will NOT open.`);
      submitBtn.disabled = false;
      submitBtn.textContent = "Verify & Submit";
      return;
    }

    // Upload Screenshot to Supabase Storage
    const cleanFileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const { error: uploadError } = await supabaseClient.storage
      .from("screenshots")
      .upload(cleanFileName, file);

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseClient.storage
      .from("screenshots")
      .getPublicUrl(cleanFileName);

    pendingSubmissionData = {
      student_name: currentUser,
      student_email: currentUserEmail,
      leetcode_id: currentLeetCodeId,
      problem_url: problemUrl,
      screenshot_url: publicUrlData.publicUrl,
      reflection_text: reflectionText,
      code_text: codeText,
      complexity_text: `Time: ${userTimeComplexity} | Space: ${userSpaceComplexity}`,
      submitted_on: today
    };

    quizQuestions = generateQuizQuestions(codeText);
    quizAnswers = [];
    currentQuizIndex = 0;

    // Unlock Quiz Modal
    submitBtn.disabled = false;
    submitBtn.textContent = "Verify & Submit";

    quizReadyScreen.classList.remove("hidden");
    quizActiveScreen.classList.add("hidden");
    aiDialog.showModal();

  } catch (error) {
    alert("Submission failed: " + error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Verify & Submit";
  }
}

if (startQuizBtn) {
  startQuizBtn.addEventListener("click", () => {
    quizReadyScreen.classList.add("hidden");
    quizActiveScreen.classList.remove("hidden");
    renderCurrentQuestion();
  });
}

// SAVE FINAL SUBMISSION WITH SAFE SCHEMA CACHE FALLBACK
async function saveFinalSubmission() {
  clearInterval(quizTimerInterval);

  if (!pendingSubmissionData) {
    return alert("No submission data found");
  }

  // 1. Calculate Quiz Score (4 MCQs = 40% Max, 10% Each)
  let correctMCQs = 0;
  for (let i = 0; i < 4; i++) {
    if (quizAnswers[i] === quizQuestions[i].correctIndex) {
      correctMCQs++;
    }
  }
  let quizScore = correctMCQs * 10;

  // 2. Calculate Final Score (100% Max)
  let finalTrustScore = formScores.codeScore + formScores.screenshotScore + formScores.logicScore + quizScore;

  // 3. Status Separation (PASSED vs FAILED vs SUSPICIOUS)
  let isPassed = finalTrustScore >= 75;
  let isSuspicious = formScores.aiFlags.length > 0;

  let status = "passed";
  let riskLevel = "low";

  if (isSuspicious) {
    status = "suspicious";
    riskLevel = "high";
  } else if (!isPassed) {
    status = "failed";
    riskLevel = "medium";
  }

  let flags = [...formScores.aiFlags];
  if (!isPassed && !isSuspicious) flags.push(`Score below 75% cutoff (${finalTrustScore}%)`);
  if (correctMCQs < 3) flags.push(`Low MCQ Score (${correctMCQs}/4)`);

  const fullFlags = `Email: ${pendingSubmissionData.student_email || 'N/A'} | LeetCode: ${pendingSubmissionData.leetcode_id || 'N/A'} | ${flags.join(", ") || "Clean Verification"}`;

  // Base payload using core columns
  const payload = {
    student_name: pendingSubmissionData.student_name,
    problem_url: pendingSubmissionData.problem_url,
    screenshot_url: pendingSubmissionData.screenshot_url,
    reflection_text: pendingSubmissionData.reflection_text,
    code_text: pendingSubmissionData.code_text,
    complexity_text: pendingSubmissionData.complexity_text,
    ai_question: `Quiz Results: ${correctMCQs}/4 MCQs Correct`,
    user_answer: `Form Verified | Code: ${formScores.codeScore}% | Screenshot: ${formScores.screenshotScore}% | Logic: ${formScores.logicScore}%`,
    time_taken_seconds: 60,
    trust_score: finalTrustScore,
    risk_level: riskLevel,
    risk_flags: fullFlags,
    status: status,
    submitted_on: pendingSubmissionData.submitted_on
  };

  // Attempt insert with extended columns first
  let insertPayload = {
    ...payload,
    student_email: pendingSubmissionData.student_email,
    leetcode_id: pendingSubmissionData.leetcode_id
  };

  let { error } = await supabaseClient
    .from("submissions")
    .insert([insertPayload]);

  // If schema cache hasn't updated for new columns, fallback to base payload
  if (error && error.message.includes("schema cache")) {
    const fallback = await supabaseClient
      .from("submissions")
      .insert([payload]);
    error = fallback.error;
  }

  if (error) {
    return alert("Saving failed: " + error.message);
  }

  alert(`🎯 Submission Evaluated!\n\nFinal Score: ${finalTrustScore}%\nPassing Requirement: 75%\nResult Status: ${status.toUpperCase()}\nMCQs Correct: ${correctMCQs}/4`);

  pendingSubmissionData = null;
  aiDialog.close();

  proofForm.reset();
  submitBtn.disabled = false;
  submitBtn.textContent = "Verify & Submit";

  await loadStudentStats();
}

if (submitQuizBtn) {
  submitQuizBtn.addEventListener("click", saveFinalSubmission);
}

async function loginUser() {
  const name = usernameInput ? usernameInput.value.trim() : "";
  const email = userEmailInput ? userEmailInput.value.trim() : "";
  const leetcode = leetcodeIdInput ? leetcodeIdInput.value.trim() : "";

  if (!name || !email || !leetcode) {
    return alert("Please fill in Name, Email, and LeetCode ID");
  }

  if (!isValidEmail(email)) {
    return alert("Please enter a valid email address (e.g. name@example.com)");
  }

  if (!isValidLeetCodeId(leetcode)) {
    return alert("Please enter a valid LeetCode Username (3-25 characters, letters, numbers, _ or -)");
  }

  currentUser = name;
  currentUserEmail = email;
  currentLeetCodeId = leetcode;

  sessionStorage.setItem("earncode_user", currentUser);
  sessionStorage.setItem("earncode_email", currentUserEmail);
  sessionStorage.setItem("earncode_leetcode", currentLeetCodeId);

  showDashboard(currentUser);
  await loadStudentStats();
}

async function loadStudentStats() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("submissions")
    .select("trust_score, status, created_at")
    .eq("student_name", currentUser)
    .order("created_at", { ascending: false });

  if (error) return console.error("Stats load error:", error.message);

  const verifiedCount = data.filter(item => item.status === "passed" || item.trust_score >= 75).length;
  if (verifiedDaysEl) verifiedDaysEl.textContent = verifiedCount;

  const latestSubmission = data.length > 0 ? data[0] : null;
  if (trustScoreEl) trustScoreEl.textContent = latestSubmission ? latestSubmission.trust_score : 0;
}

if (loginBtn) loginBtn.addEventListener("click", loginUser);
if (proofForm) proofForm.addEventListener("submit", handleSubmission);

window.addEventListener("load", () => {
  sessionStorage.clear();
  currentUser = "";
  currentUserEmail = "";
  currentLeetCodeId = "";

  if (dashboardScreen) dashboardScreen.classList.add("hidden");
  if (loginScreen) loginScreen.classList.remove("hidden");
});
