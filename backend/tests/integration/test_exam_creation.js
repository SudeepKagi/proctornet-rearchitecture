/**
 * Live integration test for Teacher All-in-One Exam Creation Flow
 */
async function run() {
  const baseUrl = 'http://localhost:3000/api/v1';

  // 1. Login as Teacher
  console.log('1. Logging in as Teacher...');
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teacher_68986@proctornet.edu', password: 'SecureTeacherPass123!' })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) throw new Error(`Teacher login failed: ${JSON.stringify(loginData)}`);
  const teacherToken = loginData.data.accessToken;
  console.log('Teacher logged in successfully.');

  // 2. Fetch canonical departments
  const deptsRes = await fetch(`${baseUrl}/student/departments`);
  const deptsData = await deptsRes.json();
  const departments = deptsData.data?.departments || deptsData.data || [];
  const chosenDept = departments[0];
  console.log(`2. Sourced canonical branch: ${chosenDept.name} (${chosenDept.department_id})`);

  // 3. Create Exam with inline questions
  const examTitle = `Algorithms Exam ${Date.now().toString().slice(-4)}`;
  const startTime = new Date(Date.now() + 86400000).toISOString();
  console.log(`3. Creating exam "${examTitle}" targeting branch ${chosenDept.name} and semester 4...`);

  const createRes = await fetch(`${baseUrl}/faculty/exams`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${teacherToken}`
    },
    body: JSON.stringify({
      title: examTitle,
      subjectName: 'Design & Analysis of Algorithms',
      description: 'Comprehensive mid-term evaluation of asymptotic analysis and graph algorithms.',
      departmentId: chosenDept.department_id,
      targetSemester: 4,
      scheduledStartTime: startTime,
      durationMinutes: 90,
      totalMarks: 50,
      passingMarks: 20,
      questions: [
        {
          prompt_text: 'What is the tightest upper bound time complexity of Dijkstra with a Fibonacci Heap?',
          points: 2,
          options: [
            { option_text: 'O(E + V log V)', is_correct: true },
            { option_text: 'O(V^2)', is_correct: false },
            { option_text: 'O(E log V)', is_correct: false },
            { option_text: 'O(V + E)', is_correct: false }
          ]
        },
        {
          prompt_text: 'Which problem-solving paradigm does the Bellman-Ford algorithm use?',
          points: 2,
          options: [
            { option_text: 'Dynamic Programming', is_correct: true },
            { option_text: 'Greedy Approach', is_correct: false },
            { option_text: 'Divide and Conquer', is_correct: false },
            { option_text: 'Branch and Bound', is_correct: false }
          ]
        }
      ]
    })
  });

  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(`Exam creation failed: ${JSON.stringify(createData)}`);
  console.log('Exam created successfully:', JSON.stringify(createData.data, null, 2));

  const examId = createData.data.exam.exam_id;
  const sessionId = createData.data.session.session_id;

  // 4. Verify Exam details
  const getExamRes = await fetch(`${baseUrl}/faculty/exams/${examId}`, {
    headers: { 'Authorization': `Bearer ${teacherToken}` }
  });
  const getExamData = await getExamRes.json();
  const examDetails = getExamData.data?.exam || getExamData.data;
  console.log('Retrieved exam:', examDetails.title, 'Status:', examDetails.status);
  console.log('Questions count:', (getExamData.data?.questions || []).length);

  if ((getExamData.data?.questions || []).length !== 2) {
    throw new Error(`Expected 2 questions, found ${(getExamData.data?.questions || []).length}`);
  }

  console.log('ALL EXAM CREATION CHECKS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
