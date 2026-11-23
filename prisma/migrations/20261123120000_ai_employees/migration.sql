-- AlterTable
ALTER TABLE "Message" ADD COLUMN "viaAi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Doc" ADD COLUMN "viaAi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Approval" ADD COLUMN "viaAi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Meeting" ADD COLUMN "minutesViaAi" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "viaAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL DEFAULT 'app',
    "aiEmployeesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTickAt" TIMESTAMP(3),
    "aiCallsDay" TEXT NOT NULL DEFAULT '',
    "aiCallsToday" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "viaLlm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiActivity_createdAt_idx" ON "AiActivity"("createdAt");

-- CreateIndex
CREATE INDEX "AiActivity_userId_createdAt_idx" ON "AiActivity"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiActivity" ADD CONSTRAINT "AiActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
