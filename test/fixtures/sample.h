#pragma once
#include <string>
#include <vector>
#include <memory>

namespace myapp {

class Base {
public:
    virtual ~Base() = default;
    virtual void process() = 0;
};

class Processor : public Base {
public:
    Processor(const std::string& name);
    void process() override;
    void addItem(int item);
    int getCount() const;

private:
    std::string m_name;
    std::vector<int> m_items;
};

struct Config {
    std::string host;
    int port;
    bool verbose;
};

} // namespace myapp
