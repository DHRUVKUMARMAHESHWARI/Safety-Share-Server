import { validationResult } from 'express-validator';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  
  return res.status(400).json({
    statusCode: 400,
    data: errors.array(),
    message: "Validation Error",
    success: false
  });
};
