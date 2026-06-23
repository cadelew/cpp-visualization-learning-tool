#include "concurrent_sample.h"

namespace concurrent {

ThreadPool::ThreadPool(size_t numThreads) {
    for (size_t i = 0; i < numThreads; ++i) {
        m_workers.emplace_back(&ThreadPool::workerLoop, this);
    }
}

ThreadPool::~ThreadPool() {
    shutdown();
}

void ThreadPool::enqueue(std::function<void()> task) {
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_tasks.push(std::move(task));
    }
    m_cv.notify_one();
}

void ThreadPool::shutdown() {
    m_shutdown.store(true, std::memory_order_release);
    m_cv.notify_all();
    for (auto& worker : m_workers) {
        if (worker.joinable()) {
            worker.join();
        }
    }
}

void ThreadPool::workerLoop() {
    while (!m_shutdown.load(std::memory_order_acquire)) {
        std::function<void()> task;
        {
            std::unique_lock<std::mutex> lock(m_mutex);
            m_cv.wait(lock, [this] {
                return m_shutdown.load(std::memory_order_relaxed) || !m_tasks.empty();
            });
            if (m_shutdown.load(std::memory_order_relaxed) && m_tasks.empty()) {
                return;
            }
            task = std::move(m_tasks.front());
            m_tasks.pop();
        }
        task();
    }
}

void ProducerConsumer::produce(int value) {
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_queue.push(value);
    }
    m_cv.notify_one();
}

int ProducerConsumer::consume() {
    std::unique_lock<std::mutex> lock(m_mutex);
    m_cv.wait(lock, [this] { return !m_queue.empty(); });
    int value = m_queue.front();
    m_queue.pop();
    return value;
}

bool ProducerConsumer::empty() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_queue.empty();
}

} // namespace concurrent
