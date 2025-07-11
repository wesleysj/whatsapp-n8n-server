const request = require('supertest');

jest.mock('whatsapp-web.js', () => {
  const sendMessage = jest.fn().mockResolvedValue({});
  const getChats = jest.fn().mockResolvedValue([]);
  const getChatById = jest.fn().mockResolvedValue({ groupMetadata: { participants: [] }});
  const Client = jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    sendMessage,
    getChats,
    getChatById,
    on: jest.fn()
  }));
  return { Client, LocalAuth: jest.fn() };
});

process.env.NODE_ENV = 'test';
const app = require('../app');

describe('API endpoints', () => {
  it('returns validation error for missing fields on /send-message', async () => {
    const res = await request(app).post('/send-message').send({});
    expect(res.statusCode).toBe(422);
  });

  it('sends message successfully', async () => {
    const res = await request(app)
      .post('/send-message')
      .send({ number: '5581999999999', message: 'hello' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe(true);
  });

  it('returns validation error when groupId is missing', async () => {
    const res = await request(app).get('/group-participants');
    expect(res.statusCode).toBe(422);
  });

  it('returns chats successfully', async () => {
    const res = await request(app).get('/chats');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe(true);
  });

  it('returns 404 for unknown route', async () => {
    const res = await request(app).get('/unknown');
    expect(res.statusCode).toBe(404);
  });
});
