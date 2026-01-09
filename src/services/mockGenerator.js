/**
 * Mock generator that creates sample output based on user data
 * This is used when USE_MOCK_GENERATION=true or when no API key is set
 */

export function generateMockOutput(userData) {
  const { profile, assessments } = userData;
  const characters = profile?.characters || [];
  const characterNames = characters.map((c) => c.displayName || c.id);
  
  // Create a hash from character names for consistent but varied output
  const charHash = characterNames.join('|').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // Use assessment answers to determine character assignments
  // Assign characters based on assessments, with fallbacks
  const egoAnswer = assessments.find(a => a.assessmentType === 'EGO_POSITION');
  const egoChar = egoAnswer && egoAnswer.selectedCharacterIds && egoAnswer.selectedCharacterIds.length > 0
    ? egoAnswer.selectedCharacterIds[0]
    : characterNames[0] || 'Unknown';
  
  const personaAnswer = assessments.find(a => a.assessmentType === 'PERSONA_POSITION');
  const personaChars = personaAnswer && personaAnswer.selectedCharacterIds && personaAnswer.selectedCharacterIds.length > 0
    ? personaAnswer.selectedCharacterIds.slice(0, 2)
    : characterNames.slice(1, 3).length > 0 ? characterNames.slice(1, 3) : [characterNames[1] || characterNames[0] || 'Unknown'];
  
  const shadowAnswer = assessments.find(a => a.assessmentType === 'SHADOW_POSITION');
  const shadowChars = shadowAnswer && shadowAnswer.selectedCharacterIds && shadowAnswer.selectedCharacterIds.length > 0
    ? shadowAnswer.selectedCharacterIds.slice(0, 2)
    : characterNames.slice(3, 5).length > 0 ? characterNames.slice(3, 5) : [characterNames[2] || characterNames[1] || 'Unknown'];
  
  const feelingAnswer = assessments.find(a => a.assessmentType === 'FEELING_FUNCTION');
  // Prioritize assessment answer - this is the most important for feeling function
  let feelingChar = 'Unknown';
  if (feelingAnswer && feelingAnswer.selectedCharacterIds && feelingAnswer.selectedCharacterIds.length > 0) {
    // Use the character selected in the FEELING_FUNCTION assessment
    feelingChar = feelingAnswer.selectedCharacterIds[0];
  } else {
    // Fallback: look for emotional/feeling-oriented characters by name
    const emotionalChars = characterNames.filter(name => {
      const lower = name.toLowerCase();
      return lower.includes('patch') || lower.includes('adams') || lower.includes('hunter') || 
             lower.includes('feeling') || lower.includes('emotional');
    });
    if (emotionalChars.length > 0) {
      feelingChar = emotionalChars[0];
    } else {
      // Last resort: use a character that hasn't been used yet
      const usedForFeeling = new Set([egoChar, ...personaChars, ...shadowChars]);
      feelingChar = characterNames.find(name => !usedForFeeling.has(name)) || characterNames[4] || characterNames[0] || 'Unknown';
    }
  }
  
  const shadowVirtueAnswer = assessments.find(a => a.assessmentType === 'SHADOW_VIRTUE');
  const shadowVirtueChar = shadowVirtueAnswer && shadowVirtueAnswer.selectedCharacterIds && shadowVirtueAnswer.selectedCharacterIds.length > 0
    ? shadowVirtueAnswer.selectedCharacterIds[0]
    : shadowChars[0] || 'Unknown';
  
  // Ensure all 6 characters are used - find unused ones
  const usedChars = new Set([egoChar, ...personaChars, ...shadowChars, feelingChar, shadowVirtueChar]);
  const unusedChars = characterNames.filter(name => !usedChars.has(name));
  
  // Use unused character for erosAxis
  const erosAxisChar = unusedChars.length > 0 ? unusedChars[0] : feelingChar;
  
  // Distribute remaining unused characters to fill gaps
  const remainingUnused = unusedChars.filter(c => c !== erosAxisChar);
  if (remainingUnused.length > 0 && personaChars.length < 2) {
    personaChars.push(remainingUnused[0]);
  }
  if (remainingUnused.length > 1 && shadowChars.length < 2) {
    shadowChars.push(remainingUnused[1]);
  }

  // Generate varied content based on character combinations
  const storyVariations = generateStoryVariations(egoChar, personaChars, shadowChars, charHash);
  const functioningVariations = generateFunctioningVariations(egoChar, shadowChars, charHash);

  const now = new Date().toISOString();

  return {
    story: {
      ...storyVariations,
      currentChapter: storyVariations.currentChapter || `You stand now in a particular chapter of your life myth—a phase where certain patterns no longer serve, where the ${egoChar} identity that has carried you begins to feel incomplete, where ${shadowChars[0]}'s voice demands to be heard. This is not a crisis, but an evolution—a necessary shedding of old skin to make room for new growth.`,
    },
    identification: {
      ego: {
        title: `Ego — ${egoChar}`,
        summary: `Your ego is primarily identified with ${egoChar}, representing your conscious self and how you navigate the world.`,
        characters: [egoChar],
        details: `The ${egoChar} archetype shapes your core identity, influencing how you perceive yourself and how others perceive you. This character embodies your primary way of being in the world.`,
      },
      persona: {
        title: `Persona — ${personaChars.join(' / ')}`,
        summary: `Your persona, the mask you present to the world, is shaped by ${personaChars.join(' and ')}.`,
        characters: personaChars,
        details: `These characters represent the social roles and masks you wear, how you present yourself to others, and the aspects of yourself you feel comfortable showing publicly.`,
      },
      shadow: {
        title: `Shadow — ${shadowChars.join(' / ')}`,
        summary: `Your shadow, the hidden or repressed aspects, is represented by ${shadowChars.join(' and ')}.`,
        characters: shadowChars,
        details: `These characters embody the parts of yourself you may reject, deny, or find difficult to acknowledge. Yet within the shadow lies great potential for growth and integration. The shadow is not evil, but contains both the worst and best of what you have denied—the rejected traits, the unexpressed emotions, the hidden talents, and the authentic aspects that felt too dangerous or unacceptable to express.`,
      },
      shadowVirtue: {
        title: `Shadow Virtue — ${shadowVirtueChar}`,
        summary: `Within your shadow lies a hidden virtue embodied by ${shadowVirtueChar}, a strength that emerges when you integrate these repressed aspects.`,
        characters: [shadowVirtueChar],
        details: `The ${shadowVirtueChar} archetype represents the positive potential hidden within what you may initially reject. By acknowledging and integrating this aspect, you unlock new dimensions of yourself and discover unexpected strengths.`,
      },
      feelingFunction: {
        title: `Feeling Function — ${feelingChar}`,
        summary: `Your feeling function is embodied by ${feelingChar}, guiding how you make value-based decisions and connect with others emotionally.`,
        characters: [feelingChar],
        details: `The ${feelingChar} archetype shapes your emotional intelligence and capacity for empathy. This character represents how you navigate relationships, make decisions based on values, and create emotional resonance with others.`,
      },
      erosAxis: {
        title: `Eros Axis — Connection & Intimacy`,
        summary: `Your eros axis represents your capacity for connection, intimacy, and relational depth.`,
        characters: [erosAxisChar],
        details: `The eros axis embodies your ability to form deep, meaningful connections with others. This represents the relational and intimate aspects of your personality, how you create bonds, express love, and navigate the space between self and other.`,
      },
      moralOrientation: {
        title: `Moral Orientation / Truth Axis`,
        summary: `How you decide what is true when rules fail, authority is incompetent, or consensus is fear-based.`,
        characters: [egoChar],
        details: `Your moral orientation represents your epistemic integrity—how you determine truth when external frameworks fail. This is not about rebellion, but about the capacity to hold your own knowing when systems break down. There is a cost to this moral loneliness: standing in truth when others choose comfort. Yet this is also where your deepest integrity lives—in the willingness to see clearly, even when it means standing alone.`,
      },
      evidence: [
        ...generateEvidence(assessments, {
          ego: egoChar,
          persona: personaChars,
          shadow: shadowChars,
          shadowVirtue: shadowVirtueChar,
          feelingFunction: feelingChar,
          erosAxis: erosAxisChar,
          allCharacters: characters, // Pass all characters for mapping IDs to names
        }),
        // Add story evidence - map to relevant assessment questions if available
        {
          targetPath: 'story.mythSummary',
          characterRefs: [egoChar, ...personaChars, ...shadowChars].filter(Boolean),
          assessmentRefs: assessments.length > 0 
            ? assessments.map(a => a.questionId || a.assessmentType).filter(Boolean)
            : ['STORY_GENERATION'],
        },
        {
          targetPath: 'story.centralTension',
          characterRefs: [personaChars[0] || egoChar, shadowChars[0] || egoChar].filter(Boolean),
          assessmentRefs: assessments.filter(a => 
            a.assessmentType === 'PERSONA_POSITION' || a.assessmentType === 'SHADOW_POSITION'
          ).map(a => a.questionId || a.assessmentType).filter(Boolean).length > 0
            ? assessments.filter(a => 
                a.assessmentType === 'PERSONA_POSITION' || a.assessmentType === 'SHADOW_POSITION'
              ).map(a => a.questionId || a.assessmentType)
            : ['STORY_GENERATION'],
        },
        {
          targetPath: 'story.guidingSentence',
          characterRefs: [egoChar, shadowChars[0] || egoChar].filter(Boolean),
          assessmentRefs: assessments.filter(a => 
            a.assessmentType === 'EGO_POSITION' || a.assessmentType === 'SHADOW_POSITION'
          ).map(a => a.questionId || a.assessmentType).filter(Boolean).length > 0
            ? assessments.filter(a => 
                a.assessmentType === 'EGO_POSITION' || a.assessmentType === 'SHADOW_POSITION'
              ).map(a => a.questionId || a.assessmentType)
            : ['STORY_GENERATION'],
        },
        {
          targetPath: 'story.currentChapter',
          characterRefs: [egoChar, shadowChars[0] || egoChar].filter(Boolean),
          assessmentRefs: assessments.length > 0 
            ? assessments.map(a => a.questionId || a.assessmentType).filter(Boolean)
            : ['LIFE_PHASE'],
        },
        // Evidence for new analytical lenses
        {
          targetPath: 'identification.moralOrientation',
          characterRefs: [egoChar].filter(Boolean),
          assessmentRefs: assessments.filter(a => 
            a.assessmentType && a.assessmentType.includes('TRUTH') || 
            a.assessmentType && a.assessmentType.includes('MORAL')
          ).map(a => a.questionId || a.assessmentType).filter(Boolean).length > 0
            ? assessments.filter(a => 
                a.assessmentType && a.assessmentType.includes('TRUTH') || 
                a.assessmentType && a.assessmentType.includes('MORAL')
              ).map(a => a.questionId || a.assessmentType)
            : ['MORAL_ORIENTATION'],
        },
        {
          targetPath: 'functioning.powerStance',
          characterRefs: [egoChar].filter(Boolean),
          assessmentRefs: assessments.filter(a => 
            a.assessmentType && a.assessmentType.includes('AUTHORITY') || 
            a.assessmentType && a.assessmentType.includes('POWER')
          ).map(a => a.questionId || a.assessmentType).filter(Boolean).length > 0
            ? assessments.filter(a => 
                a.assessmentType && a.assessmentType.includes('AUTHORITY') || 
                a.assessmentType && a.assessmentType.includes('POWER')
              ).map(a => a.questionId || a.assessmentType)
            : ['AUTHORITY_POWER'],
        },
        {
          targetPath: 'lifeDomains.truth',
          characterRefs: [egoChar].filter(Boolean),
          assessmentRefs: assessments.filter(a => 
            a.assessmentType && a.assessmentType.includes('TRUTH') || 
            a.assessmentType && a.assessmentType.includes('MORAL')
          ).map(a => a.questionId || a.assessmentType).filter(Boolean).length > 0
            ? assessments.filter(a => 
                a.assessmentType && a.assessmentType.includes('TRUTH') || 
                a.assessmentType && a.assessmentType.includes('MORAL')
              ).map(a => a.questionId || a.assessmentType)
            : ['TRUTH_AXIS'],
        },
        {
          targetPath: 'lifeDomains.leadership',
          characterRefs: [egoChar].filter(Boolean),
          assessmentRefs: assessments.filter(a => 
            a.assessmentType && a.assessmentType.includes('AUTHORITY') || 
            a.assessmentType && a.assessmentType.includes('POWER')
          ).map(a => a.questionId || a.assessmentType).filter(Boolean).length > 0
            ? assessments.filter(a => 
                a.assessmentType && a.assessmentType.includes('AUTHORITY') || 
                a.assessmentType && a.assessmentType.includes('POWER')
              ).map(a => a.questionId || a.assessmentType)
            : ['AUTHORITY_POWER'],
        },
        {
          targetPath: 'lifeDomains.intimacy',
          characterRefs: [feelingChar, erosAxisChar].filter(Boolean),
          assessmentRefs: assessments.filter(a => 
            a.assessmentType === 'FEELING_FUNCTION' || 
            a.assessmentType === 'EROS_AXIS'
          ).map(a => a.questionId || a.assessmentType).filter(Boolean).length > 0
            ? assessments.filter(a => 
                a.assessmentType === 'FEELING_FUNCTION' || 
                a.assessmentType === 'EROS_AXIS'
              ).map(a => a.questionId || a.assessmentType)
            : ['RELATIONAL_ASYMMETRY'],
        },
      ],
    },
    functioning: functioningVariations,
    actions: {
      situationBlocks: [
        {
          title: 'Facing the Shadow',
          situation: `When confronted with situations that trigger your ${shadowChars[0]} shadow—moments when rejected aspects of yourself demand attention, when denied emotions surface, when uncomfortable truths can no longer be ignored—you may initially resist or deny these aspects. This is natural; the shadow exists precisely because these aspects felt too dangerous or unacceptable to integrate.`,
          alignedResponse: [
            'Acknowledge the shadow aspect without judgment',
            'Explore what it is trying to teach you about yourself',
            'Find the hidden virtue within what you have rejected',
            'Allow the shadow to inform rather than control your actions',
            'Integrate shadow wisdom into conscious awareness',
            'Recognize that shadow aspects contain both challenge and gift',
            'Use shadow energy as a source of depth and authenticity',
            'Balance shadow integration with healthy boundaries',
          ],
          beWaryOf: [
            'Complete rejection of shadow aspects',
            'Over-identification with persona to avoid shadow',
            'Avoiding difficult emotions that shadow brings',
            'Acting out shadow impulses without integration',
            'Using shadow as excuse for destructive behavior',
            'Denying shadow to maintain comfortable identity',
            'Losing yourself in shadow without ego structure',
            'Judging shadow aspects as purely negative',
          ],
        },
        {
          title: 'Living Your Truth',
          situation: `In moments when you can fully embody ${egoChar}'s authentic nature—when external expectations fall away, when you act from your core values rather than social pressure, when you trust your own knowing—you feel most aligned. This is not about being perfect, but about being true to yourself.`,
          alignedResponse: [
            'Trust your inner wisdom and knowing',
            'Act from your core values rather than external pressure',
            'Integrate all aspects of yourself—ego, persona, shadow',
            'Maintain authenticity even when it means standing alone',
            'Allow your truth to guide decisions and actions',
            'Balance authenticity with social connection',
            'Honor your moral orientation even when rules fail',
            'Preserve what matters while releasing what no longer serves',
          ],
          beWaryOf: [
            'Rigid adherence to one way of being',
            'Ignoring feedback from others completely',
            'Losing flexibility and adaptability',
            'Using authenticity as excuse for insensitivity',
            'Confusing truth with being right',
            'Isolating yourself in moral loneliness',
            'Rejecting all social norms as inauthentic',
            'Losing connection to others in pursuit of truth',
          ],
        },
        {
          title: 'Navigating Authority & Power',
          situation: `When you encounter situations where authority is incompetent, rules are broken, or systems have lost their integrity—moments when hierarchical structures fail to serve their purpose—you face a choice: follow broken frameworks or act from your own knowing.`,
          alignedResponse: [
            'Assess whether the system serves its purpose',
            'Act from your own moral compass when systems fail',
            'Maintain integrity even when going rogue',
            'Work within systems when they function',
            'Challenge incompetence without losing yourself',
            'Preserve what works while changing what does not',
            'Balance respect for authority with independent judgment',
            'Lead by example when formal leadership fails',
          ],
          beWaryOf: [
            'Following broken rules blindly',
            'Rebelling for its own sake',
            'Losing yourself in hierarchical structures',
            'Ignoring competent authority out of habit',
            'Using going rogue as excuse for chaos',
            'Over-identifying with being the rebel',
            'Burning bridges unnecessarily',
            'Failing to work within functional systems',
          ],
        },
        {
          title: 'Relational Asymmetry & Mutuality',
          situation: `In relationships, you may notice inequality of vulnerability and emotional visibility—moments when you are more open than others, or when others expect more from you than you can give, or when the emotional exchange feels unbalanced. This asymmetry is not pathology, but a reality of how relationships actually work.`,
          alignedResponse: [
            'Name the asymmetry explicitly when it matters',
            'Normalize that relationships are rarely perfectly balanced',
            'Create conditions for mutuality where possible',
            'Set boundaries around emotional availability',
            'Recognize when asymmetry serves a purpose',
            'Honor your own needs for protection',
            'Allow others their own pace of opening',
            'Seek relationships where mutuality can grow',
          ],
          beWaryOf: [
            'Using attachment labels to pathologize asymmetry',
            'Prescribing "just open up" as solution',
            'Expecting perfect mutuality in all relationships',
            'Ignoring your own needs for protection',
            'Over-giving to force mutuality',
            'Judging others for their pace of opening',
            'Losing yourself in relationships',
            'Avoiding intimacy because of asymmetry',
          ],
        },
        {
          title: 'Life Phase Transition',
          situation: `You stand now in a particular chapter of your life myth—a phase where certain patterns no longer work, where old ways of being have reached their limits, where something new must emerge. This is not a crisis, but a natural transition in the narrative arc of your life.`,
          alignedResponse: [
            'Recognize what no longer works',
            'Preserve what must be maintained',
            'Release what has reached its natural end',
            'Allow the old self to die so the new can emerge',
            'Honor the wisdom you have gained',
            'Trust the process of transition',
            'Integrate lessons from this chapter',
            'Move forward with both loss and gain',
          ],
          beWaryOf: [
            'Treating transition as permanent identity',
            'Suggesting destiny or fate',
            'Holding onto what no longer serves',
            'Rushing through the transition',
            'Denying the loss that comes with change',
            'Expecting the new to be perfect',
            'Losing what matters in pursuit of change',
            'Fearing the unknown of the new chapter',
          ],
        },
      ],
      guidingQuestion: `How can you integrate the wisdom of ${egoChar} with the lessons from ${shadowChars[0]}, while maintaining your moral orientation and navigating the relational asymmetries of your current life chapter?`,
    },
    lifeDomains: {
      work: {
        title: 'Work & Purpose',
        iAm: [
          `${egoChar}-inspired professional`,
          'Mission-driven',
          'Purpose-oriented',
        ],
        iTendTo: [
          'Seek meaningful work',
          'Value authenticity',
          'Strive for excellence',
        ],
        typicalSituations: [
          'Taking on challenging projects',
          'Leading with integrity',
          'Balancing ambition and values',
        ],
        watchOuts: [
          'Overwork and burnout',
          'Perfectionism',
          'Neglecting personal needs',
        ],
        toRealizePotential: [
          'Find work that aligns with your values',
          'Integrate shadow aspects into your professional life',
          'Balance achievement with well-being',
        ],
        selfDirection: `Let ${egoChar}'s wisdom guide your professional path, while integrating insights from ${shadowChars[0]} to avoid blind spots.`,
      },
      leadership: {
        title: 'Authority & Power Relationship',
        iAm: [
          'Structural navigator of hierarchy',
          'Competent authority follower',
          'Rogue actor when systems fail',
        ],
        iTendTo: [
          'Work within systems when they function',
          'Go rogue when authority is incompetent',
          'Act from your own knowing when rules break down',
        ],
        typicalSituations: [
          'Authority becomes incompetent',
          'Systems lose their integrity',
          'Rules no longer serve their purpose',
          'You must act outside expected frameworks',
          'Hierarchical structures fail',
        ],
        watchOuts: [
          'Following broken rules blindly',
          'Rebelling for its own sake',
          'Losing yourself in hierarchical structures',
          'Using going rogue as excuse for chaos',
          'Over-identifying with being the rebel',
        ],
        toRealizePotential: [
          'Maintain integrity when going rogue',
          'Work within functional systems',
          'Balance respect for authority with independent judgment',
          'Lead by example when formal leadership fails',
          'Preserve what works while changing what does not',
        ],
        selfDirection: `Your relationship to authority is structural, not attitudinal. You can function within hierarchy when it serves, but you will not be constrained by systems that have lost their integrity. This going rogue is not rebellion, but a response to incompetence—maintaining epistemic integrity when external frameworks fail.`,
      },
      truth: {
        title: 'Moral Orientation / Truth Axis',
        iAm: [
          'Epistemic integrity holder',
          'Truth-seeker when rules fail',
          'Moral compass navigator',
        ],
        iTendTo: [
          'Decide what is true when authority is incompetent',
          'Hold your own knowing when consensus is fear-based',
          'Stand in truth even when it means moral loneliness',
        ],
        typicalSituations: [
          'Rules fail to serve their purpose',
          'Authority becomes incompetent',
          'Consensus is driven by fear rather than truth',
          'External frameworks break down',
          'You must determine truth independently',
        ],
        watchOuts: [
          'Moral loneliness taking its toll',
          'Using truth as weapon against others',
          'Confusing your truth with absolute truth',
          'Isolating yourself completely',
          'Losing compassion in pursuit of truth',
        ],
        toRealizePotential: [
          'Recognize the cost of moral loneliness',
          'Find others who share your epistemic integrity',
          'Balance truth-seeking with connection',
          'Hold truth without losing compassion',
          'Create conditions where truth can be spoken',
        ],
        selfDirection: `Your moral orientation is not rebellion, but epistemic integrity. When systems fail, you hold your own knowing. This has a cost—the moral loneliness of standing in truth when others choose comfort. Yet this is also where your deepest integrity lives. Honor both the truth and the cost.`,
      },
      intimacy: {
        title: 'Relational Asymmetry / Mutuality',
        iAm: [
          'Navigator of emotional inequality',
          'Creator of conditions for mutuality',
          'Boundary-setter in relationships',
        ],
        iTendTo: [
          'Experience inequality of vulnerability',
          'Notice emotional visibility imbalances',
          'Navigate relationships with explicit asymmetry',
        ],
        typicalSituations: [
          'You are more open than others',
          'Others expect more from you than you can give',
          'Emotional exchange feels unbalanced',
          'Creating conditions for mutuality',
          'Setting boundaries around availability',
        ],
        watchOuts: [
          'Using attachment labels to pathologize',
          'Prescribing "just open up" as solution',
          'Expecting perfect mutuality in all relationships',
          'Over-giving to force mutuality',
          'Losing yourself in relationships',
        ],
        toRealizePotential: [
          'Name asymmetry explicitly when it matters',
          'Normalize that relationships are rarely perfectly balanced',
          'Create conditions for mutuality where possible',
          'Honor your own needs for protection',
          'Allow others their own pace of opening',
        ],
        selfDirection: `Relational asymmetry is not pathology, but reality. Relationships are rarely perfectly balanced in vulnerability and emotional visibility. Name the asymmetry explicitly. Normalize it. Create conditions for mutuality where possible, but do not force it. Honor your own needs for protection while allowing others their own pace of opening.`,
      },
      social: {
        title: 'Social Life',
        iAm: [
          'Socially engaged',
          'Community-oriented',
          'Connector',
        ],
        iTendTo: [
          'Build networks',
          'Foster community',
          'Create belonging',
        ],
        typicalSituations: [
          'Social gatherings',
          'Community involvement',
          'Building friendships',
        ],
        watchOuts: [
          'People-pleasing',
          'Losing authenticity',
          'Social exhaustion',
        ],
        toRealizePotential: [
          'Be authentic in social settings',
          'Choose quality over quantity',
          'Balance social and alone time',
        ],
        selfDirection: 'Engage socially from your authentic self, creating genuine connections.',
      },
      innerLife: {
        title: 'Inner Life',
        iAm: [
          'Self-reflective',
          'Contemplative',
          'Spiritually aware',
        ],
        iTendTo: [
          'Seek inner wisdom',
          'Practice self-awareness',
          'Cultivate presence',
        ],
        typicalSituations: [
          'Meditation and reflection',
          'Inner dialogue',
          'Spiritual practice',
        ],
        watchOuts: [
          'Over-introspection',
          'Avoiding action',
          'Disconnection from world',
        ],
        toRealizePotential: [
          'Balance reflection with action',
          'Integrate insights into daily life',
          'Connect inner and outer worlds',
        ],
        selfDirection: 'Cultivate a rich inner life that informs and enriches your outer experience.',
      },
    },
    meta: {
      generatedAt: now,
      modelVersion: process.env.MODEL_VERSION || 'mock-generator',
      promptVersion: process.env.PROMPT_VERSION || 'v1',
      schemaVersion: parseInt(process.env.SCHEMA_VERSION || '1', 10),
    },
  };
}

// Helper functions to generate varied content based on character combinations
function generateStoryVariations(egoChar, personaChars, shadowChars, charHash) {
  const variations = [
    {
      mythSummary: `In the depths of the collective unconscious, where archetypes sleep and dreams take root, a myth unfolds across the landscape of your psyche. ${egoChar} stands at the threshold of consciousness, the hero of your personal legend, carrying the weight of your conscious identity—the "I" that navigates the waking world with intention and awareness. This archetypal figure is not merely a character in your story, but the very foundation upon which your sense of self is built. It is the voice that says "I am," the center around which your personality organizes itself, the lens through which you perceive and interpret reality.\n\nYet behind this primary self, ${personaChars[0]} and ${personaChars[1] || personaChars[0]} weave intricate masks—the social roles, the expected faces, the comfortable disguises that allow you to move through the world with grace and acceptance. These are not false selves, but necessary adaptations, the ways you have learned to present yourself to gain belonging, to protect vulnerability, to navigate the complex terrain of human relationships. The persona is the bridge between your inner world and the outer world, the mediator that allows you to function in society while preserving something of your authentic nature.\n\nBut in the shadows, where consciousness fears to tread, ${shadowChars[0]} and ${shadowChars[1] || shadowChars[0]} wait with patient intensity. They hold the rejected aspects, the denied truths, the parts of yourself you have cast into darkness—not because they are evil, but because they felt too dangerous, too unacceptable, too raw to be integrated into your conscious identity. The shadow contains both the worst and best of what you have denied: the anger you could not express, the vulnerability you could not show, the power you could not claim, the tenderness you could not allow.\n\nThis is not a story of good versus evil, but of wholeness versus fragmentation. The journey is one of integration, where the shadow becomes teacher, the persona becomes transparent, and the ego expands to include all that you are. It is a mythic descent into the underworld of the unconscious, where you must face what you have rejected, retrieve what has been lost, and return to consciousness with greater wisdom and completeness. The path is neither easy nor linear, but it is necessary for the full expression of your archetypal potential.`,
      centralTension: `The eternal dance between ${personaChars[0]}'s public face and ${shadowChars[0]}'s private truth creates the central tension of your journey—a dynamic that both constrains and liberates, that both protects and limits. You wear the mask of ${personaChars[0]}, showing the world what feels safe and acceptable, what gains approval and belonging. This mask has served you, allowing you to navigate social spaces, to build relationships, to function in the world. Yet beneath this mask, ${shadowChars[0]} holds the authentic but uncomfortable truths you have hidden away—the parts of yourself that do not fit the expected narrative, that challenge the comfortable identity you have constructed.\n\nThis tension is not a flaw to be resolved, but a dynamic force that drives your psychological development. It is the friction that creates growth, the contradiction that demands integration, the paradox that calls you toward wholeness. The persona offers safety and belonging, but at the cost of authenticity. The shadow offers truth and depth, but at the cost of comfort. The path forward is not choosing one over the other, but learning to hold both—to wear the mask when it serves, and to let it fall when authenticity demands it.`,
      guidingSentence: `Let ${egoChar} lead with conscious awareness, but listen deeply to what ${shadowChars[0]} has to teach. The path forward requires both the strength of your ego and the wisdom of your shadow—the structure of conscious identity and the depth of unconscious truth.`,
      northStarScene: `Imagine a moment of profound choice, suspended in time like a mythic threshold: ${egoChar} stands at a crossroads where two paths diverge. The familiar path of ${personaChars[0]}'s mask stretches before you, offering comfort and acceptance, the ease of fitting in, the safety of the known. The shadow path of ${shadowChars[0]} promises authenticity but demands courage, truth but requires vulnerability, depth but insists on facing what you have long denied.\n\nIn this moment, you do not choose one or the other, but both. You step onto a third path that did not exist before—one that integrates the mask's social wisdom with the shadow's raw truth, creating something new: a self that is both authentic and connected, both individual and relational, both conscious and whole. This is the moment of integration, where you become more than the sum of your parts, where the mythic journey reaches its transformative peak.`,
      currentChapter: `You stand now in a particular chapter of your life myth—a phase where certain patterns no longer serve, where old ways of being have reached their limits, where something new must emerge. The ${egoChar} identity that has carried you this far begins to feel constraining, the ${personaChars[0]} mask starts to chafe, and ${shadowChars[0]}'s voice grows louder, demanding to be heard. This is not a crisis, but a transition—a necessary death of the old self to make room for the new. What must be preserved is the wisdom you have gained, the relationships that matter, the values that anchor you. What must be released is the rigid adherence to old patterns, the fear of authenticity, the denial of shadow aspects. This chapter is about integration, about becoming more complete, about allowing all parts of yourself to exist in conscious awareness.`,
    },
    {
      mythSummary: `Your archetypal journey unfolds like an ancient myth, written in the language of symbols and dreams, where ${egoChar} emerges as the central figure of your conscious narrative. This character embodies your primary way of being in the world—your core identity, your default mode of operation, the lens through which you perceive reality and make meaning of experience. ${egoChar} is not just a role you play, but the archetypal energy that animates your personality, the fundamental pattern that shapes how you think, feel, and act.\n\nYet this is only the surface layer, the visible tip of a much deeper psychological structure. ${personaChars.join(' and ')} represent the roles you play, the faces you show, the ways you adapt to different social contexts and expectations. These are not false selves, but necessary adaptations that allow you to function in the world—the professional identity you wear at work, the social self you present to friends, the family role you inhabit at home. Each persona is a bridge between your inner world and the outer world, a way of translating your authentic nature into forms that others can understand and accept.\n\nMeanwhile, ${shadowChars.join(' and ')} dwell in the unconscious, holding aspects of yourself that you have repressed, denied, or simply not yet recognized. These shadow figures are not evil, but contain both the worst and best of what you have denied—the rejected traits, the unexpressed emotions, the hidden talents, the authentic aspects that felt too dangerous or unacceptable to express. The shadow is the repository of everything you are not, which paradoxically means it contains everything you could be.\n\nThe myth is one of descent and return: you must journey into the shadow to retrieve what has been lost, bringing it back into the light of consciousness to create a more complete self. This is the hero's journey applied to the inner world—the call to adventure, the descent into the underworld, the confrontation with what you have rejected, the retrieval of lost aspects, and the return with greater wisdom and wholeness.`,
      centralTension: `The pull between ${personaChars[0]}'s comfort and ${shadowChars[0]}'s challenge defines your growth, creating a dynamic tension that both constrains and liberates. ${personaChars[0]} offers the safety of the known, the approval of others, the ease of fitting in, the comfort of belonging. It is the path of least resistance, the way that feels familiar and safe, the identity that has served you well in navigating the social world.\n\n${shadowChars[0]} demands authenticity, truth, and the courage to be different. It challenges the comfortable identity you have constructed, insists on facing what you have denied, requires the vulnerability of showing your true self. This is not a battle to be won, but a dance to be mastered—learning when to wear the mask and when to let it fall, when to honor the shadow and when to set boundaries, when to seek belonging and when to stand alone in truth.\n\nThe tension between these forces is the engine of your psychological development. Too much persona, and you lose yourself in the roles you play. Too much shadow without integration, and you become destructive or overwhelmed. The path is finding the balance—honoring both the need to belong and the need to be authentic, both the safety of the mask and the truth of the shadow.`,
      guidingSentence: `Embrace ${egoChar}'s strength while honoring ${shadowChars[0]}'s wisdom. Your ego provides the structure and stability you need, while your shadow offers the depth and authenticity that make life meaningful. Walk with both, not one or the other.`,
      northStarScene: `Picture ${egoChar} in a moment of profound realization, standing before a mirror that reflects not just the familiar face you show the world, but also the shadow aspects you have long denied. In this moment, ${shadowChars[0]} steps forward, not as an enemy to be defeated, but as a teacher offering a gift. The gift is self-knowledge, the acceptance of your full humanity—both light and dark, both persona and shadow, both conscious and unconscious.\n\nThis is the moment of integration, where you become more than the sum of your parts, where the fragments of your identity come together into a more complete whole. The mirror shows you not who you should be, but who you are—all of it, without judgment or rejection. This is the mythic moment of transformation, where the hero returns from the underworld with new wisdom, where the shadow is no longer an enemy but a guide, where wholeness becomes possible.`,
      currentChapter: `You find yourself in a transitional chapter of your life myth—a phase where the old ways of being have reached their natural limits, where the ${egoChar} identity that has served you begins to feel incomplete, where ${shadowChars[0]}'s voice can no longer be ignored. This is not a crisis, but an evolution—a necessary shedding of old skin to make room for new growth.\n\nWhat must be preserved is the wisdom you have gained, the relationships that anchor you, the values that guide you. What must be released is the rigid adherence to old patterns, the fear of what others will think, the denial of shadow aspects that demand integration. This chapter is about becoming more complete, about allowing all parts of yourself to exist in conscious awareness, about moving from fragmentation toward wholeness.`,
    },
    {
      mythSummary: `The mythic landscape of your psyche reveals ${egoChar} as the conscious self, the "I" that thinks, feels, and acts in the world with intention and awareness. This archetypal figure carries your primary identity, the core around which your personality is organized, the foundation upon which your sense of self is built. ${egoChar} is the center of your conscious experience, the voice that narrates your life, the agent that makes choices and takes action.\n\nYet this ego exists in relationship with other archetypal forces, each playing a crucial role in the drama of your psychological life. ${personaChars.join(' and ')} represent the masks you wear—the social roles, the professional identities, the ways you present yourself to gain acceptance and belonging. These masks are not lies, but necessary adaptations that allow you to navigate the social world, to function in different contexts, to protect your vulnerability while still engaging with others. The persona is the bridge between your inner world and the outer world, the translator that makes your authentic nature accessible to others.\n\nIn the shadows, where consciousness fears to tread, ${shadowChars.join(' and ')} hold the aspects of yourself that you have rejected, repressed, or simply not yet recognized. These shadow figures are not evil, but contain both the worst and best of what you have denied—the anger you could not express, the vulnerability you could not show, the power you could not claim, the tenderness you could not allow. The shadow is the repository of everything you are not, which means it contains everything you could be.\n\nThe myth is one of wholeness: the journey from fragmentation to integration, from denial to acceptance, from a narrow ego to an expanded self that includes all aspects of your being. It is the hero's journey applied to the inner world—the call to adventure that comes when the old identity no longer fits, the descent into the shadow to face what has been denied, the retrieval of lost aspects, and the return to consciousness with greater wisdom and completeness.`,
      centralTension: `Your core struggle is balancing ${personaChars[0]}'s expectations with ${shadowChars[0]}'s authentic call—a tension that defines your psychological development and shapes your journey toward wholeness. ${personaChars[0]} represents the pressure to conform, to be acceptable, to fit in, to gain approval and belonging. It is the voice that says "be what others expect," "show only what is safe," "hide what might be rejected."\n\n${shadowChars[0]} represents the call to authenticity, to truth, to being fully yourself—even when it means standing alone, facing rejection, or challenging expectations. It is the voice that says "be who you are," "show what is real," "claim what has been denied." This tension is the engine of your psychological development. Too much persona, and you lose yourself in the roles you play. Too much shadow without integration, and you become destructive or overwhelmed. The path is finding the balance—honoring both the need to belong and the need to be authentic, both the safety of the mask and the truth of the shadow.\n\nThis is not a problem to be solved, but a dynamic to be navigated—a dance between belonging and authenticity, between safety and truth, between the known and the unknown. The goal is not to eliminate the tension, but to learn to hold it, to move with it, to use it as a force for growth and integration.`,
      guidingSentence: `Walk with ${egoChar}, but do not ignore ${shadowChars[0]}'s voice. Your ego provides direction and stability, but your shadow offers the depth and truth that make your journey meaningful. Both are necessary; neither is sufficient alone.`,
      northStarScene: `Envision ${egoChar} in a moment of transformation, standing at the threshold between the known world of ${personaChars[0]} and the unknown territory of ${shadowChars[0]}. In this moment, you realize that both are part of you, both have value, both are necessary. ${shadowChars[0]}'s hidden gift becomes clear: it is not something to be overcome, but something to be integrated—not an enemy to be defeated, but a teacher to be honored.\n\nThis is the moment of wholeness, where you accept all aspects of yourself and become more complete. The threshold is not a barrier to cross, but a space to inhabit—a place where you can hold both the mask and the shadow, both the persona and the authentic self, both the need to belong and the need to be true. This is the mythic moment of integration, where the fragments come together, where wholeness becomes possible, where the journey reaches its transformative peak.`,
      currentChapter: `You stand now in a particular chapter of your life myth—a phase of transition where old patterns no longer serve, where the ${egoChar} identity that has carried you begins to feel incomplete, where ${shadowChars[0]}'s voice demands to be heard. This is not a crisis, but an evolution—a necessary death of the old self to make room for the new.\n\nWhat must be preserved is the wisdom you have gained, the relationships that matter, the values that anchor you. What must be released is the rigid adherence to old patterns, the fear of authenticity, the denial of shadow aspects. This chapter is about integration, about becoming more complete, about allowing all parts of yourself to exist in conscious awareness. It is a time of both loss and gain, both ending and beginning, both death and rebirth—the natural rhythm of psychological growth.`,
    },
  ];
  
  return variations[charHash % variations.length];
}

// Generate evidence items that map assessments to archetype blocks
function generateEvidence(assessments, characterMap) {
  const evidence = [];
  
  // Helper to get character display names from IDs
  const getCharacterNames = (characterIds, allCharacters) => {
    if (!characterIds || characterIds.length === 0) return [];
    // If characterIds are already display names, return them
    if (typeof characterIds[0] === 'string' && !characterIds[0].includes('-') && characterIds[0].length > 3) {
      return characterIds;
    }
    // Otherwise, try to map IDs to display names
    return characterIds.map(id => {
      const char = allCharacters.find(c => c.id === id || c.displayName === id);
      return char ? char.displayName : id;
    }).filter(Boolean);
  };
  
  // Get all characters from profile for mapping
  const allCharacters = characterMap.allCharacters || [];
  
  // Map each assessment to its corresponding archetype block
  assessments.forEach(assessment => {
    if (!assessment.selectedCharacterIds || assessment.selectedCharacterIds.length === 0) {
      return;
    }
    
    let targetPath = '';
    let characterRefs = getCharacterNames(assessment.selectedCharacterIds, allCharacters);
    
    // If we couldn't map to display names, use the IDs as fallback
    if (characterRefs.length === 0) {
      characterRefs = assessment.selectedCharacterIds;
    }
    
    switch (assessment.assessmentType) {
      case 'EGO_POSITION':
        targetPath = 'identification.ego';
        break;
      case 'PERSONA_POSITION':
        targetPath = 'identification.persona';
        break;
      case 'SHADOW_POSITION':
        targetPath = 'identification.shadow';
        break;
      case 'SHADOW_VIRTUE':
        targetPath = 'identification.shadowVirtue';
        break;
      case 'FEELING_FUNCTION':
        targetPath = 'identification.feelingFunction';
        break;
      case 'EROS_AXIS':
        targetPath = 'identification.erosAxis';
        break;
      default:
        // For other assessment types, try to infer the path
        targetPath = `identification.${assessment.assessmentType.toLowerCase()}`;
    }
    
    if (targetPath && characterRefs.length > 0) {
      // Use questionId if available, otherwise fall back to assessmentType
      const questionId = assessment.questionId || assessment.assessmentType;
      evidence.push({
        targetPath: targetPath,
        characterRefs: characterRefs,
        assessmentRefs: [questionId],
      });
      console.log(`[Evidence] Added evidence for ${targetPath} from question ${questionId}`);
    }
  });
  
  // Ensure we have evidence for all archetypes, even if no assessments were provided
  // This creates fallback evidence based on assigned characters
  console.log('[Evidence] Character map:', {
    ego: characterMap.ego,
    persona: characterMap.persona,
    shadow: characterMap.shadow,
    shadowVirtue: characterMap.shadowVirtue,
    feelingFunction: characterMap.feelingFunction,
    erosAxis: characterMap.erosAxis,
  });
  
  const archetypePaths = {
    'identification.ego': { chars: characterMap.ego, assessment: 'EGO_POSITION' },
    'identification.persona': { chars: characterMap.persona, assessment: 'PERSONA_POSITION' },
    'identification.shadow': { chars: characterMap.shadow, assessment: 'SHADOW_POSITION' }, // shadow is an array
    'identification.shadowVirtue': { chars: characterMap.shadowVirtue, assessment: 'SHADOW_VIRTUE' },
    'identification.feelingFunction': { chars: characterMap.feelingFunction, assessment: 'FEELING_FUNCTION' },
    'identification.erosAxis': { chars: characterMap.erosAxis, assessment: 'EROS_AXIS' },
  };
  
  Object.entries(archetypePaths).forEach(([path, data]) => {
    const hasEvidence = evidence.some(e => e.targetPath === path);
    if (!hasEvidence && data.chars) {
      const chars = Array.isArray(data.chars) ? data.chars : [data.chars];
      const charNames = chars.map(char => {
        if (typeof char === 'string') {
          // If it's already a display name, use it
          const found = allCharacters.find(c => c.displayName === char || c.id === char);
          return found ? found.displayName : char;
        }
        return char;
      }).filter(Boolean);
      
      if (charNames.length > 0) {
        // Try to find a matching assessment for this archetype
        const matchingAssessment = assessments.find(a => 
          a.assessmentType === data.assessment
        );
        const questionId = matchingAssessment 
          ? (matchingAssessment.questionId || data.assessment)
          : data.assessment;
        
        evidence.push({
          targetPath: path,
          characterRefs: charNames,
          assessmentRefs: [questionId],
        });
        console.log(`[Evidence] Added fallback evidence for ${path}:`, charNames, `from ${questionId}`);
      } else {
        console.log(`[Evidence] No character names for ${path}, chars:`, data.chars);
      }
    } else if (hasEvidence) {
      console.log(`[Evidence] Evidence already exists for ${path}`);
    } else {
      console.log(`[Evidence] No chars provided for ${path}`);
    }
  });
  
  console.log(`[Evidence] Total evidence items: ${evidence.length}`);
  evidence.forEach(e => console.log(`  - ${e.targetPath}: ${e.characterRefs.join(', ')}`));
  
  return evidence;
}

function generateFunctioningVariations(egoChar, shadowChars, charHash) {
  const traitSets = [
    [`${egoChar}-inspired determination`, 'Archetypal depth', 'Mythic awareness'],
    [`${egoChar}'s core strength`, 'Shadow integration', 'Authentic expression'],
    [`${egoChar}-aligned purpose`, 'Psychological wholeness', 'Archetypal wisdom'],
  ];
  
  const essenceVariations = [
    `You embody the essence of ${egoChar}, carrying both the light and shadow aspects of this archetype. Your journey is one of integration and wholeness, where ${shadowChars[0]} offers crucial balance.`,
    `The ${egoChar} archetype shapes your core being, while ${shadowChars[0]} represents the untapped potential waiting to be integrated into your conscious life.`,
    `Your identity flows from ${egoChar}'s primary energy, yet ${shadowChars[0]} holds the key to deeper authenticity and wholeness.`,
  ];
  
  const narrativeVariations = [
    `Your story follows the classic hero's journey, beginning with ${egoChar}'s call to adventure, moving through trials where ${shadowChars[0]} appears as both challenge and teacher, and ultimately seeking integration and return. You stand now in a particular chapter where old patterns no longer serve, where the ${egoChar} identity that has carried you begins to feel incomplete, where ${shadowChars[0]}'s voice demands to be heard. This is not a crisis, but an evolution—a necessary shedding of old skin to make room for new growth.`,
    `The narrative arc reveals ${egoChar} as your starting point, with ${shadowChars[0]} emerging as the shadow guide who leads you toward greater self-awareness and authenticity. You find yourself in a transitional phase where what no longer works must be released, and what must be preserved becomes clear. This chapter is about integration, about becoming more complete, about allowing all parts of yourself to exist in conscious awareness.`,
    `Your journey begins with ${egoChar}'s familiar path, but ${shadowChars[0]} disrupts the expected narrative, offering a deeper, more authentic way forward. You stand now in a phase of transition where the old ways of being have reached their natural limits, where something new must emerge. What must be preserved is the wisdom you have gained; what must be released is the rigid adherence to old patterns.`,
  ];
  
  const redemptionVariations = [
    `The path to redemption involves acknowledging your shadow aspects (${shadowChars.join(', ')}) and finding the hidden virtues within them, leading to greater wholeness and ${egoChar}'s true expression. This is not about fixing what is broken, but about integrating what has been denied—transforming rejected aspects into sources of strength and wisdom.`,
    `Redemption comes through integrating ${shadowChars[0]}'s lessons into ${egoChar}'s framework, creating a more complete and authentic self. The shadow is not something to overcome, but something to honor—a teacher that offers the depth and truth that make your journey meaningful.`,
    `Your redemption arc requires embracing what ${shadowChars[0]} represents, transforming it from rejected shadow into integrated strength that enhances ${egoChar}'s expression. This is the mythic moment of transformation, where the fragments come together, where wholeness becomes possible, where the journey reaches its transformative peak.`,
  ];
  
  const costVariations = [
    `The cost of identifying primarily with ${egoChar} may include blind spots that ${shadowChars[0]} could illuminate, while the compensation is a clear sense of identity and purpose. These costs are not failures, but the natural consequences of choosing one way of being over another. They are irreversible in the sense that every choice closes some doors, but they are also the price of having a coherent identity.`,
    `Over-identifying with ${egoChar} risks missing ${shadowChars[0]}'s essential wisdom, yet ${egoChar} provides the stable foundation for growth. The compensation is clarity and direction; the cost is the depth and complexity that shadow integration would bring. This is the trade-off inherent in psychological development—every path has its costs and its compensations.`,
    `${egoChar} offers strength and clarity, but without ${shadowChars[0]}'s integration, you may miss deeper truths about yourself and your potential. The cost is the loss of wholeness, the compensation is the comfort of a clear identity. These are not mistakes to be corrected, but choices with consequences—the natural rhythm of psychological growth.`,
  ];
  
  const powerStanceVariations = [
    `Your relationship to authority and power is complex. You have a tolerance for hierarchy when it serves a purpose, but when authority becomes incompetent or systems break down, you are willing to go rogue—to act from your own knowing rather than following broken rules. This is not rebellion for its own sake, but a structural response to incompetence. You can work within systems when they function, but you will not be constrained by systems that have lost their integrity.`,
    `Your stance toward authority reflects a capacity to navigate hierarchy without losing yourself. When those in power are competent and systems function, you can work within them. But when authority fails or rules become arbitrary, you respond by going rogue—acting from your own moral compass rather than following broken frameworks. This is not an attitude problem, but a structural relationship to power that allows you to maintain integrity even when systems fail.`,
    `You have a nuanced relationship with authority and power. You can function within hierarchical structures when they serve their purpose, but when authority becomes incompetent or systems break down, you are willing to step outside the expected framework and act from your own knowing. This going rogue is not about defiance, but about maintaining epistemic integrity when external frameworks fail.`,
  ];
  
  const index = charHash % 3;
  
  return {
    coreTraits: traitSets[index],
    symbolicEssence: essenceVariations[index],
    narrativeArc: narrativeVariations[index],
    redemptionArc: redemptionVariations[index],
    costsAndCompensations: costVariations[index],
    powerStance: powerStanceVariations[index],
    alignmentIndicators: {
      aligned: [
        'Living authentically',
        'Integrating shadow aspects',
        'Balancing persona and true self',
        'Maintaining integrity when systems fail',
        'Acting from your own knowing',
      ],
      unaligned: [
        'Over-identification with persona',
        'Rejecting shadow aspects',
        'Losing connection to true self',
        'Following broken rules blindly',
        'Losing yourself in hierarchical structures',
      ],
    },
  };
}
