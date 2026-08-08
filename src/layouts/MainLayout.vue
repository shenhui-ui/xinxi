<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">文玺 WenXi</div>
      <el-menu router :default-active="$route.path" class="menu">
        <el-menu-item index="/">驾驶舱</el-menu-item>
        <el-menu-item index="/tasks">任务管理</el-menu-item>
        <el-menu-item index="/meetings">会议管理</el-menu-item>
        <el-menu-item index="/documents">文件收发</el-menu-item>
        <el-menu-item index="/activities">外出活动</el-menu-item>
        <el-menu-item index="/seals">用章管理</el-menu-item>
        <el-menu-item index="/supplies">物资管理</el-menu-item>
        <el-menu-item index="/trash">回收站</el-menu-item>
        <el-menu-item index="/writing">公文写作</el-menu-item>
        <el-menu-item index="/glossary">UI 术语</el-menu-item>
        <el-menu-item index="/settings">AI 配置</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">{{ $route.meta.title || '文玺' }}</el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
</script>

<style scoped>
.layout { height: 100vh; }
.aside { background: #f5f7fa; }
.logo { padding: 16px; font-weight: 600; }
.menu { border-right: none; }
.header {
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  font-weight: 600;
}
.main { background: #fff; }
</style>
