/**
 * Automated verification script for QuestionMenu using node-pty
 *
 * Tests:
 * - Single-select mode navigation
 * - Multi-select mode with checkboxes
 * - Keyboard handling
 * - Render output
 */

import * as pty from 'node-pty';
import { QuestionInput } from '../../src/permissions/PermissionUI';
import { QuestionMenu } from '../../src/permissions/PermissionUI';

interface TestResult {
  testName: string;
  passed: boolean;
  output: string;
  error?: string;
}

async function testSingleSelect(): Promise<TestResult> {
  const testName = 'Single-Select Mode';

  return new Promise((resolve) => {
    const ptyProcess = pty.spawn('node', ['-e', `
      const { QuestionMenu } = require('./dist/src/permissions/PermissionUI');
      const menu = new QuestionMenu(process.stdout, process.stdin);
      const question = {
        question: 'Select language:',
        header: 'Language',
        multiSelect: false,
        options: [
          { label: 'TypeScript', description: 'Typed JS' },
          { label: 'Python', description: 'Scripting' },
        ],
      };

      menu.show(question).then(result => {
        console.log('RESULT:' + result);
        process.exit(0);
      }).catch(err => {
        console.log('ERROR:' + err.message);
        process.exit(1);
      });
    `], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    });

    let output = '';
    ptyProcess.onData((data) => {
      output += data;
    });

    ptyProcess.onExit(({ exitCode }) => {
      const passed = exitCode === 0 && output.includes('RESULT:TypeScript');
      resolve({
        testName,
        passed,
        output: output.substring(0, 500),
        error: exitCode !== 0 ? 'Process exited with code ' + exitCode : undefined,
      });
    });

    // Simulate user navigation and selection
    setTimeout(() => {
      ptyProcess.write('\x1b[B'); // Down arrow
    }, 100);

    setTimeout(() => {
      ptyProcess.write('\r'); // Enter
    }, 200);
  });
}

async function testMultiSelect(): Promise<TestResult> {
  const testName = 'Multi-Select Mode';

  return new Promise((resolve) => {
    const ptyProcess = pty.spawn('node', ['-e', `
      const { QuestionMenu } = require('./dist/src/permissions/PermissionUI');
      const menu = new QuestionMenu(process.stdout, process.stdin);
      const question = {
        question: 'Select options:',
        header: 'Options',
        multiSelect: true,
        options: [
          { label: 'A', description: 'Option A' },
          { label: 'B', description: 'Option B' },
          { label: 'C', description: 'Option C' },
        ],
      };

      menu.show(question).then(result => {
        console.log('RESULT:' + result);
        process.exit(0);
      }).catch(err => {
        console.log('ERROR:' + err.message);
        process.exit(1);
      });
    `], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    });

    let output = '';
    ptyProcess.onData((data) => {
      output += data;
    });

    ptyProcess.onExit(({ exitCode }) => {
      const passed = exitCode === 0 && output.includes('RESULT:');
      resolve({
        testName,
        passed,
        output: output.substring(0, 500),
        error: exitCode !== 0 ? 'Process exited with code ' + exitCode : undefined,
      });
    });

    // Simulate user navigation, toggle, and selection
    setTimeout(() => {
      ptyProcess.write('\x1b[B'); // Down
    }, 100);

    setTimeout(() => {
      ptyProcess.write(' '); // Space to toggle
    }, 200);

    setTimeout(() => {
      ptyProcess.write('\x1b[B'); // Down
    }, 300);

    setTimeout(() => {
      ptyProcess.write(' '); // Space to toggle
    }, 400);

    setTimeout(() => {
      ptyProcess.write('\r'); // Enter
    }, 500);
  });
}

async function testCancel(): Promise<TestResult> {
  const testName = 'Cancel with Esc';

  return new Promise((resolve) => {
    const ptyProcess = pty.spawn('node', ['-e', `
      const { QuestionMenu } = require('./dist/src/permissions/PermissionUI');
      const menu = new QuestionMenu(process.stdout, process.stdin);
      const question = {
        question: 'Select:',
        header: 'Test',
        multiSelect: false,
        options: [{ label: 'Option 1' }, { label: 'Option 2' }],
      };

      menu.show(question).then(result => {
        console.log('UNEXPECTED:' + result);
        process.exit(2);
      }).catch(err => {
        console.log('ERROR:' + err.message);
        process.exit(0);
      });
    `], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    });

    let output = '';
    ptyProcess.onData((data) => {
      output += data;
    });

    ptyProcess.onExit(({ exitCode }) => {
      const passed = exitCode === 0 && output.includes('ERROR:User canceled');
      resolve({
        testName,
        passed,
        output: output.substring(0, 500),
        error: exitCode !== 0 ? 'Process exited with code ' + exitCode : undefined,
      });
    });

    // Simulate Esc press
    setTimeout(() => {
      ptyProcess.write('\x1b'); // Esc
    }, 100);
  });
}

async function runAllTests(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         QuestionMenu Automated Verification              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const tests = [
    testSingleSelect,
    testMultiSelect,
    testCancel,
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    try {
      const result = await test();
      results.push(result);

      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} - ${result.testName}`);

      if (!result.passed) {
        console.log(`   Error: ${result.error || 'Unknown error'}`);
        console.log(`   Output: ${result.output.substring(0, 100)}...`);
      }
      console.log('');
    } catch (error) {
      console.log(`❌ FAIL - ${test.name}`);
      console.log(`   Error: ${error}\n`);
      results.push({
        testName: test.name,
        passed: false,
        output: '',
        error: String(error),
      });
    }
  }

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  console.log('\n' + '═'.repeat(60));
  console.log(`Results: ${passedCount}/${totalCount} tests passed`);
  console.log('═'.repeat(60));

  if (passedCount === totalCount) {
    console.log('\n✅ All tests passed successfully!\n');
  } else {
    console.log('\n⚠️  Some tests failed\n');
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
