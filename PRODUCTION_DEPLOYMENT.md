# 🚀 BBG Discord Bot - Production Deployment Guide

## 📋 **Overview**

This guide covers deploying the BBG Discord Bot to production with Docker, monitoring, and best practices for reliability and performance.

## 🏗️ **Production Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │────│   Discord Bot   │────│   MongoDB       │
│   (Nginx)       │    │   (Node.js)     │    │   Database      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Health Checks │    │   Logging       │    │   Backup        │
│   Monitoring    │    │   System        │    │   System        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 **Prerequisites**

### **Required Software**
- Docker & Docker Compose
- Node.js 18+ (for development)
- Git
- MongoDB (or MongoDB Atlas)

### **Required Environment Variables**
```bash
# Copy the production environment template
cp env.production.example .env.production

# Edit with your values
nano .env.production
```

## 🚀 **Quick Start**

### **1. Clone Repository**
```bash
git clone https://github.com/revcodeshq/BBGbot.git
cd BBGbot
```

### **2. Configure Environment**
```bash
# Copy production environment template
cp env.production.example .env.production

# Edit with your production values
nano .env.production
```

### **3. Deploy with Docker Compose**
```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f bbg-bot
```

### **4. Verify Deployment**
```bash
# Check bot health
docker-compose exec bbg-bot npm run health-check

# Validate production environment
docker-compose exec bbg-bot npm run validate-production
```

## 🐳 **Docker Deployment**

### **Single Container Deployment**
```bash
# Build image
docker build -t bbg-discord-bot .

# Run container
docker run -d \
  --name bbg-bot \
  --env-file .env.production \
  --restart unless-stopped \
  -p 3000:3000 \
  bbg-discord-bot
```

### **Docker Compose Deployment**
```bash
# Start all services
docker-compose up -d

# Scale bot instances (if needed)
docker-compose up -d --scale bbg-bot=2

# Update services
docker-compose pull
docker-compose up -d
```

## 📊 **Monitoring & Health Checks**

### **Health Check Endpoints**
- **HTTP Health Check**: `http://localhost:3000/health`
- **Discord Command**: `/health` (detailed diagnostics)

### **Health Check Types**
```bash
# Quick status check
/health type:quick

# Detailed diagnostics
/health type:detailed

# Environment validation
/health type:environment

# Performance metrics
/health type:performance

# System information
/health type:system
```

### **Monitoring Commands**
```bash
# Check bot health
npm run health-check

# Validate production environment
npm run validate-production

# View Docker logs
docker-compose logs -f bbg-bot

# Check container status
docker-compose ps
```

## 🔒 **Security Best Practices**

### **Environment Security**
- ✅ Use strong, unique tokens and secrets
- ✅ Enable MongoDB authentication
- ✅ Use HTTPS for all external connections
- ✅ Set up proper firewall rules
- ✅ Regular security updates

### **Discord Bot Security**
- ✅ Use minimal required permissions
- ✅ Enable 2FA on Discord account
- ✅ Regular token rotation
- ✅ Monitor for suspicious activity

### **Database Security**
- ✅ Use MongoDB Atlas or secured MongoDB instance
- ✅ Enable authentication and authorization
- ✅ Regular backups
- ✅ Network access restrictions

## 📈 **Performance Optimization**

### **Resource Limits**
```yaml
# docker-compose.yml
services:
  bbg-bot:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
```

### **Database Optimization**
- ✅ Proper indexing on frequently queried fields
- ✅ Connection pooling
- ✅ Query optimization
- ✅ Regular maintenance

### **Caching Strategy**
- ✅ In-memory caching for frequently accessed data
- ✅ Redis for distributed caching (optional)
- ✅ CDN for static assets (if applicable)

## 🔄 **Backup & Recovery**

### **Database Backups**
```bash
# Create backup
docker-compose exec mongodb mongodump --out /backup/$(date +%Y%m%d)

# Restore backup
docker-compose exec mongodb mongorestore /backup/20240101
```

### **Configuration Backups**
```bash
# Backup environment files
cp .env.production .env.production.backup.$(date +%Y%m%d)

# Backup Docker volumes
docker run --rm -v bbg_mongodb_data:/data -v $(pwd):/backup alpine tar czf /backup/mongodb-backup.tar.gz /data
```

## 🚨 **Troubleshooting**

### **Common Issues**

#### **Bot Not Starting**
```bash
# Check logs
docker-compose logs bbg-bot

# Validate environment
docker-compose exec bbg-bot npm run validate-production

# Check Discord token
docker-compose exec bbg-bot node -e "console.log(process.env.DISCORD_TOKEN ? 'Token set' : 'Token missing')"
```

#### **Database Connection Issues**
```bash
# Check MongoDB status
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"

# Check connection string
docker-compose exec bbg-bot node -e "console.log(process.env.MONGODB_URI)"
```

#### **High Memory Usage**
```bash
# Check memory usage
docker stats bbg-bot

# Restart with memory limits
docker-compose restart bbg-bot
```

### **Log Analysis**
```bash
# View all logs
docker-compose logs

# Filter by service
docker-compose logs bbg-bot

# Follow logs in real-time
docker-compose logs -f bbg-bot

# Search for errors
docker-compose logs bbg-bot | grep ERROR
```

## 🔄 **Updates & Maintenance**

### **Updating the Bot**
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Verify update
docker-compose logs -f bbg-bot
```

### **Database Maintenance**
```bash
# Connect to MongoDB
docker-compose exec mongodb mongosh

# Check database stats
db.stats()

# Check collection sizes
db.runCommand({collStats: "users"})

# Rebuild indexes
db.users.reIndex()
```

## 📞 **Support & Resources**

### **Documentation**
- [Discord.js Documentation](https://discord.js.org/#/docs)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Docker Documentation](https://docs.docker.com/)

### **Community**
- [Discord.js Discord Server](https://discord.gg/djs)
- [GitHub Issues](https://github.com/revcodeshq/BBGbot/issues)

### **Emergency Contacts**
- **Discord Bot Issues**: Contact server administrators
- **Technical Support**: Create GitHub issue
- **Security Issues**: Email security@revcodeshq.com

## 📋 **Production Checklist**

### **Pre-Deployment**
- [ ] Environment variables configured
- [ ] Database connection tested
- [ ] Discord token validated
- [ ] Health checks working
- [ ] Logging configured
- [ ] Backup strategy implemented

### **Post-Deployment**
- [ ] Bot responding to commands
- [ ] Health checks passing
- [ ] Monitoring alerts configured
- [ ] Performance metrics normal
- [ ] Error logging working
- [ ] Backup system tested

### **Ongoing Maintenance**
- [ ] Regular security updates
- [ ] Performance monitoring
- [ ] Log rotation
- [ ] Database maintenance
- [ ] Backup verification
- [ ] Health check monitoring

---

## 🎉 **Congratulations!**

Your BBG Discord Bot is now production-ready! The bot includes:

- ✅ **Production-grade logging and monitoring**
- ✅ **Health checks and diagnostics**
- ✅ **Docker containerization**
- ✅ **Environment validation**
- ✅ **Security best practices**
- ✅ **Backup and recovery procedures**
- ✅ **Performance optimization**
- ✅ **Comprehensive documentation**

For additional support or questions, please refer to the troubleshooting section or create a GitHub issue.
