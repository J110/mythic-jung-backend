import express from 'express';
import { memoryStore } from '../storage/memoryStore.js';
import { getAllQuestions, getQuestionsByType, getQuestionById } from '../data/assessmentQuestions.js';

export const assessmentRouter = express.Router();

const getUserId = (req) => {
  return req.headers['x-user-id'] || 'default-user';
};

// POST /v1/assessments/answer - Submit assessment answer
assessmentRouter.post('/answer', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const answer = req.body;

    if (!answer.assessmentType || !answer.questionId || !answer.selectedCharacterIds) {
      return res.status(400).json({
        error: 'assessmentType, questionId, and selectedCharacterIds are required',
      });
    }

    memoryStore.saveAssessmentAnswer(userId, answer);
    
    // Invalidate cached output when assessment answers change
    // This ensures regeneration happens with new answers
    memoryStore.clearOutput(userId);

    console.log(`Assessment answer saved for user ${userId}: ${answer.assessmentType}/${answer.questionId}`);
    res.json({ success: true, answer });
  } catch (error) {
    next(error);
  }
});

// GET /v1/assessments - Get all assessment answers
assessmentRouter.get('/', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const answers = memoryStore.getAssessmentAnswers(userId);

    res.json({ answers });
  } catch (error) {
    next(error);
  }
});

// GET /v1/assessments/questions - Get all assessment questions
assessmentRouter.get('/questions', async (req, res, next) => {
  try {
    const { assessmentType } = req.query;
    
    if (assessmentType) {
      const questions = getQuestionsByType(assessmentType);
      res.json({ questions });
    } else {
      const questions = getAllQuestions();
      res.json({ questions });
    }
  } catch (error) {
    next(error);
  }
});

// GET /v1/assessments/questions/:questionId - Get specific question
assessmentRouter.get('/questions/:questionId', async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const question = getQuestionById(questionId);
    
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ question });
  } catch (error) {
    next(error);
  }
});
