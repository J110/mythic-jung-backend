/**
 * Test script to verify character validation works
 * Run with: node test_character_validation.js
 */

import { validateCharacters, looksLikeJunk, isMeaningfulCharacter } from './src/services/characterValidator.js';

console.log('=== Testing Character Validation ===\n');

// Test 1: Junk values (single letters)
console.log('Test 1: Junk values (a, b, c, d, e, f)');
const junkChars = [
  { id: '1', displayName: 'a' },
  { id: '2', displayName: 'b' },
  { id: '3', displayName: 'c' },
  { id: '4', displayName: 'd' },
  { id: '5', displayName: 'e' },
  { id: '6', displayName: 'f' },
];

const validation1 = validateCharacters(junkChars);
console.log('Validation result:', validation1);
console.log('Looks like junk:', looksLikeJunk(junkChars));
console.log('Expected: valid=false, looksLikeJunk=true\n');

// Test 2: Real characters
console.log('Test 2: Real characters');
const realChars = [
  { id: '1', displayName: 'Jack Reacher' },
  { id: '2', displayName: 'Patch Adams' },
  { id: '3', displayName: 'Sherlock Holmes' },
  { id: '4', displayName: 'Hermione Granger' },
  { id: '5', displayName: 'Aragorn' },
  { id: '6', displayName: 'Gandalf' },
];

const validation2 = validateCharacters(realChars);
console.log('Validation result:', validation2);
console.log('Looks like junk:', looksLikeJunk(realChars));
console.log('Expected: valid=true, looksLikeJunk=false\n');

// Test 3: Mixed (some real, some junk)
console.log('Test 3: Mixed (some real, some junk)');
const mixedChars = [
  { id: '1', displayName: 'Jack Reacher' },
  { id: '2', displayName: 'b' },
  { id: '3', displayName: 'c' },
  { id: '4', displayName: 'd' },
  { id: '5', displayName: 'e' },
  { id: '6', displayName: 'f' },
];

const validation3 = validateCharacters(mixedChars);
console.log('Validation result:', validation3);
console.log('Looks like junk:', looksLikeJunk(mixedChars));
console.log('Expected: valid=false (only 1 meaningful)\n');

// Test 4: Individual character validation
console.log('Test 4: Individual character validation');
console.log('isMeaningfulCharacter("a"):', isMeaningfulCharacter('a'));
console.log('isMeaningfulCharacter("Jack Reacher"):', isMeaningfulCharacter('Jack Reacher'));
console.log('isMeaningfulCharacter("test"):', isMeaningfulCharacter('test'));
console.log('isMeaningfulCharacter("Aragorn"):', isMeaningfulCharacter('Aragorn'));
console.log('isMeaningfulCharacter(""):', isMeaningfulCharacter(''));
console.log('isMeaningfulCharacter("123"):', isMeaningfulCharacter('123'));
console.log('\n');

// Test 5: Test with dynamicGenerator
console.log('Test 5: Testing with dynamicGenerator (should throw error for junk)');
import { generateDynamicOutput } from './src/services/dynamicGenerator.js';

const junkUserData = {
  profile: {
    characters: junkChars,
  },
  assessments: [],
};

try {
  const output = generateDynamicOutput(junkUserData);
  console.log('ERROR: Should have thrown an error for junk values!');
  console.log('Output:', JSON.stringify(output, null, 2).substring(0, 200));
} catch (error) {
  console.log('SUCCESS: Correctly rejected junk values');
  console.log('Error message:', error.message);
}

console.log('\n=== All Tests Complete ===');
