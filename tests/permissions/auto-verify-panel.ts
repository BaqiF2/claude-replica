/**
 * Automated verification for PermissionPanel
 *
 * This script automatically verifies PermissionPanel functionality
 * without requiring manual input.
 */

import { PermissionPanel } from '../../src/permissions/PermissionUI';
import { ToolPermissionRequest } from '../../src/permissions/types';
import { Writable, Readable } from 'stream';

async function verify() {
  console.log('\n=== PermissionPanel Automated Verification ===\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Verify panel displays correctly
  console.log('Test 1: Verify panel displays tool name and parameters');
  try {
    const outputData: string[] = [];
    const mockOutput = new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        outputData.push(chunk.toString());
        callback();
      },
    });

    const mockInput = new Readable({
      read() {
        // No-op
      },
    });

    const panel = new PermissionPanel(mockOutput, mockInput);

    const request: ToolPermissionRequest = {
      toolName: 'Bash',
      toolUseID: 'verify-001',
      input: {
        command: 'ls -la',
        description: 'List files',
      },
      timestamp: new Date(),
    };

    setTimeout(() => {
      mockInput.push('y');
    }, 10);

    await panel.show(request);

    const output = outputData.join('');
    const checks = [
      { name: 'Contains tool name', test: output.includes('Bash') },
      { name: 'Contains command parameter', test: output.includes('command') },
      { name: 'Contains command value', test: output.includes('ls -la') },
    ];

    for (const check of checks) {
      if (check.test) {
        console.log(`  ✓ ${check.name}`);
        passed++;
      } else {
        console.log(`  ✗ ${check.name}`);
        failed++;
      }
    }
  } catch (error) {
    console.log(`  ✗ Test failed with error: ${error}`);
    failed++;
  }

  console.log('');

  // Test 2: Verify user input handling
  console.log('Test 2: Verify user input handling (y/n/Esc)');
  for (const testCase of [
    { input: 'y', expectedApproved: true, name: '"y" key' },
    { input: 'n', expectedApproved: false, name: '"n" key' },
    { input: '\x1b', expectedApproved: false, name: 'Esc key' },
  ]) {
    try {
      const mockOutput = new Writable({
        write(_chunk: Buffer, _encoding: string, callback: () => void) {
          callback();
        },
      });

      const mockInput = new Readable({
        read() {
          // No-op
        },
      });

      const panel = new PermissionPanel(mockOutput, mockInput);

      const request: ToolPermissionRequest = {
        toolName: 'Test',
        toolUseID: 'verify-input',
        input: {},
        timestamp: new Date(),
      };

      setTimeout(() => {
        mockInput.push(testCase.input);
      }, 10);

      const result = await panel.show(request);

      if (result.approved === testCase.expectedApproved) {
        console.log(`  ✓ Correctly handles ${testCase.name}`);
        passed++;
      } else {
        console.log(`  ✗ Failed to handle ${testCase.name}`);
        failed++;
      }
    } catch (error) {
      console.log(`  ✗ Test failed with error: ${error}`);
      failed++;
    }
  }

  console.log('');

  // Test 3: Verify empty parameters handling
  console.log('Test 3: Verify empty parameters handling');
  try {
    const outputData: string[] = [];
    const mockOutput = new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        outputData.push(chunk.toString());
        callback();
      },
    });

    const mockInput = new Readable({
      read() {
        // No-op
      },
    });

    const panel = new PermissionPanel(mockOutput, mockInput);

    const request: ToolPermissionRequest = {
      toolName: 'EmptyTool',
      toolUseID: 'verify-empty',
      input: {},
      timestamp: new Date(),
    };

    setTimeout(() => {
      mockInput.push('y');
    }, 10);

    await panel.show(request);

    const output = outputData.join('');
    if (output.includes('no parameters')) {
      console.log('  ✓ Displays "(no parameters)" for empty input');
      passed++;
    } else {
      console.log('  ✗ Does not display "(no parameters)" for empty input');
      failed++;
    }
  } catch (error) {
    console.log(`  ✗ Test failed with error: ${error}`);
    failed++;
  }

  console.log('');
  console.log('=== Verification Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log('');

  if (failed === 0) {
    console.log('✓ All verification tests passed!');
    process.exit(0);
  } else {
    console.log('✗ Some verification tests failed.');
    process.exit(1);
  }
}

verify().catch((error) => {
  console.error('Verification error:', error);
  process.exit(1);
});
