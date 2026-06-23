#pragma once
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <atomic>
#include <vector>
#include <functional>

namespace concurrent {

class ThreadPool {
public:
    explicit ThreadPool(size_t numThreads);
    ~ThreadPool();

    void enqueue(std::function<void()> task);
    void shutdown();

private:
    void workerLoop();

    std::vector<std::thread> m_workers;
    std::queue<std::function<void()>> m_tasks;
    std::mutex m_mutex;
    std::condition_variable m_cv;
    std::atomic<bool> m_shutdown{false};
};

class ProducerConsumer {
public:
    void produce(int value);
    int consume();
    bool empty() const;

private:
    std::queue<int> m_queue;
    mutable std::mutex m_mutex;
    std::condition_variable m_cv;
};

} // namespace concurrent
