import { ApiResponse } from '../utils/ApiResponse.js';

export const getHealth = (req, res) => {
  res.status(200).json(
    new ApiResponse(200, { status: 'OK', timestamp: new Date() }, "Server is healthy")
  );
};
