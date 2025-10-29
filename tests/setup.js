// Jest setup file for BBG Discord Bot tests
require('dotenv').config({ path: '.env.test' });

// Mock Discord.js to avoid requiring a real bot token
jest.mock('discord.js', () => {
  const mockCollection = {
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    forEach: jest.fn(),
    map: jest.fn(),
    filter: jest.fn(),
    find: jest.fn(),
    some: jest.fn(),
    every: jest.fn(),
    reduce: jest.fn(),
    size: 0,
    *[Symbol.iterator]() {},
  };

  const mockEmbed = {
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setAuthor: jest.fn().mockReturnThis(),
    setThumbnail: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
    setImage: jest.fn().mockReturnThis(),
    toJSON: jest.fn(),
  };

  const mockButton = {
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis(),
    setDisabled: jest.fn().mockReturnThis(),
    setURL: jest.fn().mockReturnThis(),
    setEmoji: jest.fn().mockReturnThis(),
  };

  const mockActionRow = {
    addComponents: jest.fn().mockReturnThis(),
  };

  const mockSelectMenu = {
    setCustomId: jest.fn().mockReturnThis(),
    setPlaceholder: jest.fn().mockReturnThis(),
    addOptions: jest.fn().mockReturnThis(),
    setMinValues: jest.fn().mockReturnThis(),
    setMaxValues: jest.fn().mockReturnThis(),
  };

  const mockModal = {
    setCustomId: jest.fn().mockReturnThis(),
    setTitle: jest.fn().mockReturnThis(),
    addComponents: jest.fn().mockReturnThis(),
  };

  const mockTextInput = {
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis(),
    setPlaceholder: jest.fn().mockReturnThis(),
    setRequired: jest.fn().mockReturnThis(),
    setValue: jest.fn().mockReturnThis(),
    setMinLength: jest.fn().mockReturnThis(),
    setMaxLength: jest.fn().mockReturnThis(),
  };

  return {
    Client: jest.fn().mockImplementation(() => ({
      login: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      commands: mockCollection,
      guilds: mockCollection,
      users: mockCollection,
      channels: mockCollection,
      user: {
        id: '123456789',
        username: 'TestBot',
        tag: 'TestBot#0000',
        displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
      },
    })),
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
      MessageContent: 4,
      GuildMembers: 8,
    },
    EmbedBuilder: jest.fn().mockImplementation(() => mockEmbed),
    ActionRowBuilder: jest.fn().mockImplementation(() => mockActionRow),
    ButtonBuilder: jest.fn().mockImplementation(() => mockButton),
    StringSelectMenuBuilder: jest.fn().mockImplementation(() => mockSelectMenu),
    ModalBuilder: jest.fn().mockImplementation(() => mockModal),
    TextInputBuilder: jest.fn().mockImplementation(() => mockTextInput),
    ButtonStyle: {
      Primary: 1,
      Secondary: 2,
      Success: 3,
      Danger: 4,
      Link: 5,
    },
    TextInputStyle: {
      Short: 1,
      Paragraph: 2,
    },
    PermissionFlagsBits: {
      Administrator: 'Administrator',
      ManageGuild: 'ManageGuild',
    },
    SlashCommandBuilder: jest.fn().mockImplementation(() => ({
      setName: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      setDefaultMemberPermissions: jest.fn().mockReturnThis(),
      addStringOption: jest.fn().mockReturnThis(),
      addUserOption: jest.fn().mockReturnThis(),
      addChannelOption: jest.fn().mockReturnThis(),
      addRoleOption: jest.fn().mockReturnThis(),
      addIntegerOption: jest.fn().mockReturnThis(),
      addBooleanOption: jest.fn().mockReturnThis(),
      addSubcommand: jest.fn().mockReturnThis(),
      addSubcommandGroup: jest.fn().mockReturnThis(),
    })),
    Collection: jest.fn().mockImplementation(() => mockCollection),
    REST: jest.fn().mockImplementation(() => ({
      setToken: jest.fn().mockReturnThis(),
      put: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      get: jest.fn(),
    })),
    Routes: {
      applicationCommands: jest.fn(),
      applicationGuildCommands: jest.fn(),
    },
  };
});

// Mock mongoose to avoid requiring MongoDB connection
jest.mock('mongoose', () => ({
  connect: jest.fn(),
  connection: {
    readyState: 1,
    on: jest.fn(),
    once: jest.fn(),
  },
  Schema: jest.fn().mockImplementation((_definition) => ({
    pre: jest.fn(),
    post: jest.fn(),
    methods: {},
    statics: {},
    virtual: jest.fn(),
  })),
  model: jest.fn(),
  models: {},
}));

// Mock axios for API calls
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  create: jest.fn().mockReturnValue({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  }),
}));

// Mock node-fetch
jest.mock('node-fetch', () => jest.fn());

// Mock fs for file operations
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
}));

// Mock path
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/')),
  dirname: jest.fn((file) => file.split('/').slice(0, -1).join('/')),
  extname: jest.fn((file) => '.' + file.split('.').pop()),
  basename: jest.fn((file) => file.split('/').pop()),
}));

// Global test utilities
global.createMockInteraction = (overrides = {}) => ({
  id: '123456789',
  token: 'mock-token',
  guild: {
    id: '987654321',
    name: 'Test Guild',
  },
  user: {
    id: '111111111',
    username: 'TestUser',
    tag: 'TestUser#0000',
    displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
  },
  member: {
    id: '111111111',
    displayName: 'TestUser',
    roles: {
      add: jest.fn(),
      remove: jest.fn(),
      cache: new Map(),
    },
  },
  channel: {
    id: '555555555',
    send: jest.fn(),
    type: 0, // GUILD_TEXT
  },
  commandName: 'test',
  options: {
    getString: jest.fn(),
    getUser: jest.fn(),
    getChannel: jest.fn(),
    getRole: jest.fn(),
    getInteger: jest.fn(),
    getBoolean: jest.fn(),
    getSubcommand: jest.fn(),
  },
  reply: jest.fn(),
  editReply: jest.fn(),
  followUp: jest.fn(),
  deferReply: jest.fn(),
  deleteReply: jest.fn(),
  replied: false,
  deferred: false,
  ...overrides,
});

global.createMockMessage = (overrides = {}) => ({
  id: '123456789',
  content: 'test message',
  author: {
    id: '111111111',
    username: 'TestUser',
    tag: 'TestUser#0000',
    bot: false,
  },
  guild: {
    id: '987654321',
    name: 'Test Guild',
  },
  channel: {
    id: '555555555',
    send: jest.fn(),
    type: 0,
  },
  reply: jest.fn(),
  react: jest.fn(),
  delete: jest.fn(),
  ...overrides,
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});