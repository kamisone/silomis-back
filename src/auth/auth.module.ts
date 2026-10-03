import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminsModule } from '../admins/admins.module';
import { SmsModule } from '../sms/sms.module';
import { EmailModule } from '../email/email.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { MfaService } from './mfa.service';
import { MfaNotificationService } from './mfa-notification.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '15m' },
      }),
    }),
    AdminsModule,
    SmsModule,
    // The MFA code goes out through the one shared transport, like every other
    // email — see MfaNotificationService.
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, MfaService, MfaNotificationService],
})
export class AuthModule {}
