const path = require('node:path');
const fs = require('node:fs/promises');
const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
const { spawn } = require('node:child_process');

(async () => {
  const root = path.resolve(__dirname, '..');
  const workspace = path.join(root, '.vscode-test', 'activity-workspace');
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(workspace, 'activity.txt'), 'before\nsame\nlast\n');
  const executable = await downloadAndUnzipVSCode('1.90.2');
  const env = { ...process.env, CHANGE_PULSE_TEST_WORKSPACE: workspace };
  delete env.ELECTRON_RUN_AS_NODE;
  // Launch the executable directly: shell-based runners split Windows paths with spaces.
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, [workspace,
      `--extensionDevelopmentPath=${root}`,
      `--extensionTestsPath=${path.join(root, 'tests', 'host-suite.cjs')}`,
      `--user-data-dir=${path.join(root, '.vscode-test', 'user-data')}`,
      `--extensions-dir=${path.join(root, '.vscode-test', 'extensions')}`,
      '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates'
    ], { env, stdio: 'inherit', shell: false, windowsHide: true });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (code !== 0) { throw new Error(`Extension host exited with ${code}`); }
})().catch(error => { console.error(error); process.exitCode = 1; });
