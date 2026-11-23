import { readFile, writeFile } from 'node:fs/promises';

const platform = process.argv[2];

if (platform === 'android') {
  const path = 'android/app/src/main/AndroidManifest.xml';
  let xml = await readFile(path, 'utf8');
  const permission = '<uses-permission android:name="android.permission.RECORD_AUDIO" />';
  if (!xml.includes(permission)) {
    xml = xml.replace('<manifest', '<manifest');
    const applicationTag = xml.indexOf('<application');
    if (applicationTag < 0) throw new Error('Android manifest has no application element.');
    xml = xml.slice(0, applicationTag) + permission + '\n    ' + xml.slice(applicationTag);
    await writeFile(path, xml, 'utf8');
  }
  const variablesPath = 'android/variables.gradle';
  try {
    let variables = await readFile(variablesPath, 'utf8');
    variables = variables.replace(/targetSdkVersion\s*=\s*\d+/, 'targetSdkVersion = 36');
    variables = variables.replace(/compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 36');
    await writeFile(variablesPath, variables, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  console.log('Android microphone permission configured; target SDK set to API 36 when variables.gradle is present.');
} else if (platform === 'ios') {
  const path = 'ios/App/App/Info.plist';
  let plist = await readFile(path, 'utf8');
  const entries = [
    ['NSMicrophoneUsageDescription', 'يحتاج StudyAI إلى الميكروفون لتحويل سؤالك الصوتي إلى نص عندما تضغط على زر التحدث.'],
    ['NSSpeechRecognitionUsageDescription', 'يستخدم StudyAI التعرف على الكلام لفهم أسئلتك الصوتية باللغة العربية المصرية أو الإنجليزية.']
  ];
  for (const [key, value] of entries) {
    if (!plist.includes('<key>' + key + '</key>')) {
      const entry = '  <key>' + key + '</key>\n  <string>' + value + '</string>\n';
      plist = plist.replace('</dict>', entry + '</dict>');
    }
  }
  await writeFile(path, plist, 'utf8');
  console.log('iOS microphone and speech-recognition usage descriptions configured.');
} else {
  throw new Error('Pass either android or ios.');
}
