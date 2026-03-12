import { Button, Card, Space, Typography } from 'antd';
import { CloseOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useUatOnboardingStore } from '../../store/uatOnboarding.store';
import { useAuthStore } from '../../store/auth.store';

export default function UatOnboardingOverlay() {
  const { activeTest, currentStepIndex, nextStep, prevStep, stopTest } = useUatOnboardingStore();
  const { user } = useAuthStore();

  if (!activeTest) return null;

  const step = activeTest.steps[currentStepIndex];
  const totalSteps = activeTest.steps.length;
  const isLast = currentStepIndex === totalSteps - 1;

  const handleNext = () => {
    if (isLast && user?.id && typeof window !== 'undefined') {
      try {
        const storageKey = `tasktime-uat-progress:${user.id}`;
        const raw = window.localStorage.getItem(storageKey);
        const parsed: string[] = raw ? JSON.parse(raw) : [];
        if (!parsed.includes(activeTest.id)) {
          const updated = [...parsed, activeTest.id];
          window.localStorage.setItem(storageKey, JSON.stringify(updated));
        }
      } catch {
        // ignore storage errors, онбординг всё равно должен работать
      }
    }
    nextStep();
  };

  return (
    <Card
      size="small"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        width: 380,
        maxWidth: '100%',
        zIndex: 1000,
        boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
      }}
      title={
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <div>
            <Typography.Text strong>{activeTest.title}</Typography.Text>
            <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
              Шаг {currentStepIndex + 1} из {totalSteps}
            </Typography.Text>
          </div>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={stopTest}
          />
        </Space>
      }
      bodyStyle={{ paddingTop: 8 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Typography.Text strong>{step.title}</Typography.Text>
        <Typography.Paragraph style={{ marginBottom: 4 }}>
          {step.description}
        </Typography.Paragraph>
        {step.expectedResult && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            Ожидаемый результат: {step.expectedResult}
          </Typography.Paragraph>
        )}
        <Space style={{ justifyContent: 'space-between', width: '100%', marginTop: 8 }}>
          <Button
            size="small"
            icon={<LeftOutlined />}
            onClick={prevStep}
            disabled={currentStepIndex === 0}
          >
            Назад
          </Button>
          <Space>
            <Button size="small" onClick={stopTest}>
              Завершить
            </Button>
            <Button
              type="primary"
              size="small"
              icon={!isLast ? <RightOutlined /> : undefined}
              onClick={handleNext}
            >
              {isLast ? 'Готово' : 'Далее'}
            </Button>
          </Space>
        </Space>
      </Space>
    </Card>
  );
}

