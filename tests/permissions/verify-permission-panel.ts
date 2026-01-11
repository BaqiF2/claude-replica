/**
 * Manual verification script for PermissionPanel
 *
 * Run this script to manually test PermissionPanel in a real terminal:
 * npx ts-node tests/permissions/verify-permission-panel.ts
 */

import { PermissionPanel } from '../../src/permissions/PermissionUI';
import { ToolPermissionRequest } from '../../src/permissions/types';

async function main() {
  console.log('\n=== PermissionPanel Manual Verification ===\n');
  console.log('This script will test PermissionPanel with various tool requests.');
  console.log('Press y/n/Esc to respond to each request.\n');

  const panel = new PermissionPanel();

  // Test 1: Simple tool with parameters
  console.log('Test 1: Simple Bash command');
  const request1: ToolPermissionRequest = {
    toolName: 'Bash',
    toolUseID: 'test-001',
    input: {
      command: 'ls -la',
      description: 'List all files in current directory',
    },
    timestamp: new Date(),
  };

  const result1 = await panel.show(request1);
  console.log(`Result: ${result1.approved ? 'APPROVED' : 'DENIED'}`);
  if (result1.reason) {
    console.log(`Reason: ${result1.reason}`);
  }
  console.log('');

  // Test 2: Tool with long parameters
  console.log('Test 2: Write tool with long content');
  const request2: ToolPermissionRequest = {
    toolName: 'Write',
    toolUseID: 'test-002',
    input: {
      file_path: '/tmp/test-file.txt',
      content:
        'This is a very long content string that should be truncated in the display to avoid overwhelming the terminal output. It contains multiple sentences and lots of words to ensure we test the truncation logic properly.',
    },
    timestamp: new Date(),
  };

  const result2 = await panel.show(request2);
  console.log(`Result: ${result2.approved ? 'APPROVED' : 'DENIED'}`);
  if (result2.reason) {
    console.log(`Reason: ${result2.reason}`);
  }
  console.log('');

  // Test 3: Tool with no parameters
  console.log('Test 3: Tool with no parameters');
  const request3: ToolPermissionRequest = {
    toolName: 'GetSystemInfo',
    toolUseID: 'test-003',
    input: {},
    timestamp: new Date(),
  };

  const result3 = await panel.show(request3);
  console.log(`Result: ${result3.approved ? 'APPROVED' : 'DENIED'}`);
  if (result3.reason) {
    console.log(`Reason: ${result3.reason}`);
  }
  console.log('');

  console.log('=== Verification Complete ===\n');

  // Exit cleanly
  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
