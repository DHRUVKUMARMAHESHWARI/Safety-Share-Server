import { config } from '../config/env.js';

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  res.status(statusCode).json({
    message: err.message,
    stack: config.env === 'production' ? null : err.stack,
  });
};

export { errorHandler };
