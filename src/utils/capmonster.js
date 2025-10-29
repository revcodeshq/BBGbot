const axios = require('axios');

async function solveCaptchaCapMonster(base64Data, apiKey) {
  // Create task
  const createTaskUrl = 'https://api.capmonster.cloud/createTask';
  const taskPayload = {
    clientKey: apiKey,
    task: {
      type: 'ImageToTextTask',
      body: base64Data,
      module: 'common'
    }
  };
  const createResp = await axios.post(createTaskUrl, taskPayload);
  if (createResp.data.errorId !== 0) {
    throw new Error(`CapMonster createTask error: ${createResp.data.errorDescription}`);
  }
  const taskId = createResp.data.taskId;

  // Poll for result
  const getResultUrl = 'https://api.capmonster.cloud/getTaskResult';
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const resultResp = await axios.post(getResultUrl, {
      clientKey: apiKey,
      taskId
    });
    if (resultResp.data.errorId !== 0) {
      throw new Error(`CapMonster getTaskResult error: ${resultResp.data.errorDescription}`);
    }
    if (resultResp.data.status === 'ready') {
      return resultResp.data.solution.text;
    }
  }
  throw new Error('CapMonster polling timed out');
}

module.exports = { solveCaptchaCapMonster };