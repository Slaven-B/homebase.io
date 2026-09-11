import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from './activity/activity.module';
import { AuthModule } from './auth/auth.module';
import { ChoresModule } from './chores/chores.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppConfigService } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { Environment } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { HouseholdsModule } from './households/households.module';
import { InvitationsModule } from './invitations/invitations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShoppingModule } from './shopping/shopping.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // Generous global limit; auth endpoints tighten it with @Throttle().
    // Disabled in the test environment so integration tests can hammer endpoints.
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        skipIf: () => config.nodeEnv === Environment.Test,
      }),
    }),
    HealthModule,
    UsersModule,
    AuthModule,
    HouseholdsModule,
    InvitationsModule,
    ActivityModule,
    ShoppingModule,
    TasksModule,
    ChoresModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
