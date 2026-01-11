/**
 * Manual verification script for QuestionMenu component
 *
 * This script provides interactive tests for:
 * - Single-select mode with ▶ cursor
 * - Multi-select mode with [ ]/[✓] checkboxes
 * - Arrow key navigation (↑↓)
 * - Space key toggle (multi-select)
 * - Enter confirmation
 * - Esc cancellation
 */

import { QuestionMenu, QuestionInput } from '../../src/permissions/PermissionUI';

async function runSingleSelectTest(): Promise<void> {
  console.log('\n=== Test 1: Single-Select Mode ===\n');
  console.log('Instructions: Use ↑↓ to navigate, Enter to confirm, Esc to cancel\n');

  const menu = new QuestionMenu();
  const question: QuestionInput = {
    question: 'Which authentication method should we use?',
    header: 'Auth Method',
    multiSelect: false,
    options: [
      {
        label: 'JWT',
        description: 'JSON Web Tokens for stateless authentication',
      },
      {
        label: 'OAuth 2.0',
        description: 'OAuth 2.0 authorization framework',
      },
      {
        label: 'Session',
        description: 'Traditional session-based authentication',
      },
    ],
  };

  try {
    const result = await menu.show(question);
    console.log(`\n✓ Selected: ${result}\n`);
  } catch (error) {
    console.log(`\n✗ Canceled: ${error}\n`);
  }
}

async function runMultiSelectTest(): Promise<void> {
  console.log('\n=== Test 2: Multi-Select Mode ===\n');
  console.log('Instructions: Use ↑↓ to navigate, Space to toggle, Enter to confirm, Esc to cancel\n');

  const menu = new QuestionMenu();
  const question: QuestionInput = {
    question: 'Which features do you want to enable?',
    header: 'Features',
    multiSelect: true,
    options: [
      {
        label: 'Dark Mode',
        description: 'Enable dark theme support',
      },
      {
        label: 'Notifications',
        description: 'Push notifications for updates',
      },
      {
        label: 'Analytics',
        description: 'User behavior tracking',
      },
      {
        label: 'Offline Mode',
        description: 'Work without internet connection',
      },
    ],
  };

  try {
    const result = await menu.show(question);
    console.log(`\n✓ Selected: ${result}\n`);
  } catch (error) {
    console.log(`\n✗ Canceled: ${error}\n`);
  }
}

async function runLongOptionsTest(): Promise<void> {
  console.log('\n=== Test 3: Long Options List ===\n');
  console.log('Instructions: Test scrolling through many options\n');

  const menu = new QuestionMenu();
  const question: QuestionInput = {
    question: 'Select your preferred programming language:',
    header: 'Language',
    multiSelect: false,
    options: [
      { label: 'TypeScript', description: 'Typed superset of JavaScript' },
      { label: 'Python', description: 'High-level interpreted language' },
      { label: 'Rust', description: 'Systems programming language' },
      { label: 'Go', description: 'Compiled language by Google' },
      { label: 'Java', description: 'Object-oriented programming language' },
      { label: 'C#', description: '.NET framework language' },
      { label: 'Ruby', description: 'Dynamic programming language' },
    ],
  };

  try {
    const result = await menu.show(question);
    console.log(`\n✓ Selected: ${result}\n`);
  } catch (error) {
    console.log(`\n✗ Canceled: ${error}\n`);
  }
}

async function runNoDescriptionTest(): Promise<void> {
  console.log('\n=== Test 4: Options Without Descriptions ===\n');

  const menu = new QuestionMenu();
  const question: QuestionInput = {
    question: 'Choose a size:',
    header: 'Size',
    multiSelect: false,
    options: [
      { label: 'Small', description: '' },
      { label: 'Medium', description: '' },
      { label: 'Large', description: '' },
    ],
  };

  try {
    const result = await menu.show(question);
    console.log(`\n✓ Selected: ${result}\n`);
  } catch (error) {
    console.log(`\n✗ Canceled: ${error}\n`);
  }
}

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         QuestionMenu Component Manual Verification         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Test 1: Single-select
    await runSingleSelectTest();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test 2: Multi-select
    await runMultiSelectTest();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test 3: Long options
    await runLongOptionsTest();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test 4: No descriptions
    await runNoDescriptionTest();

    console.log('\n✅ All tests completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
