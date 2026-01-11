/**
 * Interactive manual test for QuestionMenu component
 *
 * This file can be run directly to manually test QuestionMenu functionality:
 *   npx ts-node tests/permissions/manual-verify-question-menu.ts
 *
 * Manual test checklist:
 * ✓ Single-select mode: Use ↑↓ to navigate, Enter to confirm
 * ✓ Multi-select mode: Use ↑↓ to navigate, Space to toggle, Enter to confirm
 * ✓ Esc cancellation: Press Esc to cancel
 * ✓ Render display: Verify correct visual rendering
 */

import { QuestionMenu, QuestionInput } from '../../src/permissions/PermissionUI';

async function runManualTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         QuestionMenu Manual Verification                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const tests = [
    {
      name: 'Test 1: Single-Select Mode',
      question: {
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
      } as QuestionInput,
      instructions: 'Use ↑↓ to navigate, Enter to confirm, Esc to cancel',
    },
    {
      name: 'Test 2: Multi-Select Mode',
      question: {
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
      } as QuestionInput,
      instructions: 'Use ↑↓ to navigate, Space to toggle selections, Enter to confirm',
    },
    {
      name: 'Test 3: No Descriptions',
      question: {
        question: 'Choose a size:',
        header: 'Size',
        multiSelect: false,
        options: [
          { label: 'Small', description: '' },
          { label: 'Medium', description: '' },
          { label: 'Large', description: '' },
        ],
      } as QuestionInput,
      instructions: 'Simple options without descriptions',
    },
  ];

  for (const test of tests) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${test.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n${test.instructions}\n`);

    const menu = new QuestionMenu();

    try {
      const result = await menu.show(test.question);
      console.log(`\n✅ Selected: ${result}\n`);
    } catch (error: any) {
      console.log(`\n⚠️  Canceled: ${error.message}\n`);
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '═'.repeat(60));
  console.log('All manual tests completed!');
  console.log('═'.repeat(60) + '\n');
}

// Check if this is being run directly
if (require.main === module) {
  runManualTests()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

export { runManualTests };
