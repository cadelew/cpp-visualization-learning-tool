#include "sample.h"
#include <iostream>
#include <algorithm>

namespace myapp {

Processor::Processor(const std::string& name) : m_name(name) {}

void Processor::process() {
    std::cout << "Processing " << m_name << std::endl;
    std::sort(m_items.begin(), m_items.end());
    for (const auto& item : m_items) {
        std::cout << item << " ";
    }
    std::cout << std::endl;
}

void Processor::addItem(int item) {
    m_items.push_back(item);
}

int Processor::getCount() const {
    return static_cast<int>(m_items.size());
}

} // namespace myapp
