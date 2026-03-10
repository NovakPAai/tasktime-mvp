import { useEffect } from 'react';
import { Typography, Card, Row, Col, Statistic } from 'antd';
import { ProjectOutlined } from '@ant-design/icons';
import { useProjectsStore } from '../store/projects.store';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function DashboardPage() {
  const { projects, loading, fetchProjects } = useProjectsStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) return <LoadingSpinner />;

  const totalIssues = projects.reduce((sum, p) => sum + (p._count?.issues ?? 0), 0);

  return (
    <>
      <Typography.Title level={3}>Dashboard</Typography.Title>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic title="Projects" value={projects.length} prefix={<ProjectOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Total Issues" value={totalIssues} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
